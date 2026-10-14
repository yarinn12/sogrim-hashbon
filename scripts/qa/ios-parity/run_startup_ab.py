"""Reviewable, unsigned startup A/B on one macOS host; never releases an app.

Four original XCTest journeys run once each on fresh simulators. The two source
commits and two observer modes are paired in ABBA order. No retry, readiness
assertion or 35-second XCTest wait is changed. --execute is required.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time


FIXTURE_ROOT = Path(__file__).resolve().parents[3]
BASE_FIXTURE = "14d6f43660072acdf4e0252328c24d60c9d4dc81"
SOURCES = {
    "3f": ("3f1976105fbc6bae48fcc1ff3ed975db5a8b98c1",
           "8a9ae9b8e00533c84edd3022ec993ac937e4460a"),
    "4e": ("4e6f1dfba954fe34abcde60ed92af657e8457805",
           "6323e010cc2dc2ec818c5bb8c3bef1b712e15a56"),
}
ARMS = (("3f", False), ("4e", False), ("4e", True), ("3f", True))


def output(args, cwd=None, timeout=30):
    return subprocess.check_output(args, cwd=cwd, text=True, timeout=timeout).strip()


def logged(args, path, cwd=None, env=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as stream:
        return subprocess.run(args, cwd=cwd, env=env, stdout=stream,
                              stderr=subprocess.STDOUT, check=False).returncode


def identity(repo):
    return (output(["git", "rev-parse", "HEAD"], cwd=repo),
            output(["git", "rev-parse", "HEAD^{tree}"], cwd=repo))


def verify_inputs(expected_fixture):
    fixture_sha, fixture_tree = identity(FIXTURE_ROOT)
    if fixture_sha != expected_fixture:
        raise RuntimeError("fixture checkout does not match the reviewed SHA")
    if output(["git", "merge-base", BASE_FIXTURE, fixture_sha], cwd=FIXTURE_ROOT) != BASE_FIXTURE:
        raise RuntimeError("fixture is not based on the reviewed diagnostic")
    locked = ["scripts/qa/ios-parity/journey.js",
              "scripts/qa/ios-parity/ParityUITests.swift",
              "scripts/qa/ios-parity/synthetic-service.js"]
    if output(["git", "diff", "--name-only", f"{BASE_FIXTURE}..HEAD", "--", *locked], cwd=FIXTURE_ROOT):
        raise RuntimeError("original XCTest journey or synthetic service changed")
    apps = {}
    for label, (sha, tree) in SOURCES.items():
        app = FIXTURE_ROOT / f"app-{label}"
        if identity(app) != (sha, tree):
            raise RuntimeError(f"{label} source identity mismatch")
        if output(["git", "status", "--porcelain"], cwd=app):
            raise RuntimeError(f"{label} source checkout has local changes before build")
        apps[label] = app
    return fixture_sha, fixture_tree, apps


def simulator_target():
    runtimes = json.loads(output(["xcrun", "simctl", "list", "runtimes", "-j"]))["runtimes"]
    available = [row for row in runtimes if row.get("isAvailable") and ".iOS-" in row["identifier"]]
    runtime = sorted(available, key=lambda row: tuple(int(part) for part in row["version"].split(".")))[-1]
    types = json.loads(output(["xcrun", "simctl", "list", "devicetypes", "-j"]))["devicetypes"]
    device = next(row for name in ("iPhone 16", "iPhone 15") for row in types if row["name"] == name)
    return runtime, device


def prepare_source(app, sha, fixture_root, out):
    env = {**os.environ, "APP_SHA": sha, "SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD": "1",
           "IOS_STARTUP_DIAGNOSTIC": "1"}
    commands = [
        (["npm", "ci"], "npm-ci.log"),
        (["node", str(fixture_root / "scripts/qa/ios-parity/build-www.mjs")], "bundle.log"),
        (["npx", "cap", "sync", "ios"], "cap-sync.log"),
        (["node", "scripts/finalize-native-projects.mjs"], "finalize.log"),
        (["python3", str(fixture_root / "scripts/qa/ios-parity/prepare.py"),
          "prepare", str(app), sha], "prepare.log"),
    ]
    for command, name in commands:
        if logged(command, out / name, cwd=app, env=env):
            raise RuntimeError(f"source preparation failed: {name}")


def collect_native(udid, out):
    try:
        container = Path(output(["xcrun", "simctl", "get_app_container", udid,
                                 "com.sogrimhashbon.app", "data"], timeout=8))
        documents = container / "Documents"
        collected = []
        for path in sorted(documents.glob("native-parity*")):
            if path.is_file() and path.suffix in {".json", ".log", ".png"}:
                shutil.copy2(path, out / path.name)
                collected.append(path.name)
        return {"status": "collected", "files": collected}
    except (OSError, subprocess.SubprocessError) as error:
        return {"status": "unavailable", "reason": type(error).__name__}


def document_timing(out):
    journals = sorted(out.glob("native-parity-startup-*.log"))
    if len(journals) != 1:
        return {"status": "unavailable", "reason": "journal-count"}
    try:
        rows = [json.loads(line) for line in journals[0].read_text(encoding="utf8").splitlines()
                if line.startswith("{")]
        origins = {row["timeOriginMs"] for row in rows
                   if row.get("event") == "web-stage" and isinstance(row.get("timeOriginMs"), (int, float))}
        if len(origins) != 1:
            return {"status": "unavailable", "reason": "origin-count"}
        return {"status": "recorded", "timeOriginMs": origins.pop(),
                "journal": journals[0].name,
                "localResourceEvents": sum(row.get("stage") == "local-resource" for row in rows)}
    except (OSError, ValueError):
        return {"status": "unavailable", "reason": "journal-invalid"}


def stop_observer(observer, stop_file):
    stop_file.touch()
    try:
        code = observer.wait(timeout=15)
        return code, "passed" if code == 0 else "failed"
    except subprocess.TimeoutExpired:
        observer.terminate()
        try:
            observer.wait(timeout=5)
        except subprocess.TimeoutExpired:
            observer.kill()
            observer.wait(timeout=5)
        return "stop-timeout", "failed"


def arm_run(label, observer_enabled, app, source_sha, source_tree, runtime, device,
            fixture_sha, fixture_tree, out, build_done, prepare_error=None):
    arm = f"{label}-observer-{'on' if observer_enabled else 'off'}"
    arm_out = out / arm
    arm_out.mkdir(parents=True, exist_ok=False)
    record = {"arm": arm, "sourceSha": source_sha, "sourceTree": source_tree,
              "fixtureSha": fixture_sha, "fixtureTree": fixture_tree,
              "observerEnabled": observer_enabled, "observerStatus": "not-started" if observer_enabled else "disabled",
              "simulatorUdid": None,
              "runtimeIdentifier": runtime["identifier"], "runtimeVersion": runtime["version"],
              "deviceType": device["name"], "freshSimulator": False, "testRuns": 0,
              "collection": {"status": "not-run"}, "documentTiming": {"status": "not-run"}}
    identity_file = arm_out / "identity.json"
    identity_file.write_text(json.dumps(record, indent=2), encoding="utf8")
    if prepare_error:
        record["executionError"] = "preparation-failed"
        record["executionErrorMessage"] = prepare_error
        identity_file.write_text(json.dumps(record, indent=2), encoding="utf8")
        return record
    udid = None
    observer = None
    observer_stream = None
    stop_file = arm_out / "observer" / "stop"
    try:
        udid = output(["xcrun", "simctl", "create", f"Startup AB {arm}",
                       device["identifier"], runtime["identifier"]])
        record["simulatorUdid"] = udid
        record["freshSimulator"] = True
        if logged(["xcrun", "simctl", "boot", udid], arm_out / "boot.log"):
            raise RuntimeError("simulator boot failed")
        if logged(["xcrun", "simctl", "bootstatus", udid, "-b"], arm_out / "bootstatus.log"):
            raise RuntimeError("simulator bootstatus failed")
        derived = app / "build/native-parity/derived"
        if label not in build_done:
            command = ["xcodebuild", "-project", "ios/App/App.xcodeproj", "-scheme", "App",
                       "-configuration", "Debug", "-sdk", "iphonesimulator",
                       "-destination", f"platform=iOS Simulator,id={udid}",
                       "-derivedDataPath", str(derived), "build-for-testing", "CODE_SIGNING_ALLOWED=NO"]
            if logged(command, arm_out / "build.log", cwd=app):
                raise RuntimeError("unsigned build-for-testing failed")
            build_done.add(label)
        if observer_enabled:
            stop_file.parent.mkdir()
            observer_stream = (stop_file.parent / "observer.log").open("wb")
            observer = subprocess.Popen(
                ["python3", str(FIXTURE_ROOT / "scripts/qa/ios-parity/native_stall_monitor.py"),
                 "--udid", udid, "--bundle-id", "com.sogrimhashbon.app",
                 "--manifest", str(app / "build/native-parity/package-manifest.json"),
                 "--source-sha", source_sha, "--source-tree", source_tree,
                 "--output-dir", str(stop_file.parent), "--stop-file", str(stop_file)],
                cwd=app, stdout=observer_stream, stderr=subprocess.STDOUT)
        command = ["xcodebuild", "-project", "ios/App/App.xcodeproj", "-scheme", "App",
                   "-configuration", "Debug", "-destination", f"platform=iOS Simulator,id={udid}",
                   "-derivedDataPath", str(derived), "-resultBundlePath", str(arm_out / "result.xcresult"),
                   "test-without-building", "CODE_SIGNING_ALLOWED=NO"]
        record["testRuns"] = 1
        record["testExitCode"] = logged(command, arm_out / "test.log", cwd=app)
        if observer:
            record["observerExitCode"], record["observerStatus"] = stop_observer(observer, stop_file)
            observer = None
        record["collection"] = collect_native(udid, arm_out)
        record["documentTiming"] = document_timing(arm_out)
    except Exception as error:
        record["executionError"] = type(error).__name__
        record["executionErrorMessage"] = str(error)
    finally:
        if observer:
            try:
                record["observerExitCode"], record["observerStatus"] = stop_observer(observer, stop_file)
            except Exception as error:
                record["observerStatus"] = "failed"
                record["observerStopError"] = type(error).__name__
        if observer_stream:
            observer_stream.close()
        if udid:
            for action in ("shutdown", "delete"):
                try:
                    record[f"{action}ExitCode"] = logged(["xcrun", "simctl", action, udid],
                                                         arm_out / f"{action}.log")
                except Exception as error:
                    record[f"{action}Error"] = type(error).__name__
        identity_file.write_text(json.dumps(record, indent=2), encoding="utf8")
    return record


def diagnostic_complete(records):
    expected = [f"{label}-observer-{'on' if enabled else 'off'}" for label, enabled in ARMS]
    if [row.get("arm") for row in records] != expected:
        return False
    return all(
        row.get("testExitCode") == 0 and row.get("testRuns") == 1
        and row.get("freshSimulator") is True and row.get("simulatorUdid")
        and isinstance(row.get("observerEnabled"), bool)
        and not row.get("executionError")
        and row.get("collection", {}).get("status") == "collected"
        and row.get("documentTiming", {}).get("status") == "recorded"
        and row.get("observerStatus") == ("passed" if row.get("observerEnabled") else "disabled")
        for row in records
    )


def run_matrix(apps, runtime, device, fixture_sha, fixture_tree, output_dir, host):
    built = set()
    preparation = {}
    records = []
    for label, enabled in ARMS:
        sha, tree = SOURCES[label]
        if label not in preparation:
            try:
                prepare_source(apps[label], sha, FIXTURE_ROOT, output_dir / f"prepare-{label}")
                preparation[label] = None
            except Exception as error:
                preparation[label] = f"{type(error).__name__}: {error}"
        record = arm_run(label, enabled, apps[label], sha, tree, runtime, device,
                         fixture_sha, fixture_tree, output_dir, built,
                         prepare_error=preparation[label])
        records.append(record)
        (output_dir / "summary.json").write_text(json.dumps({
            "host": host, "arms": records,
            "diagnosticComplete": diagnostic_complete(records),
            "releaseAcceptance": False
        }, indent=2), encoding="utf8")
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="Run the four unsigned simulator journeys")
    parser.add_argument("--fixture-sha", help="Exact reviewed fixture checkout for execution")
    args = parser.parse_args()
    plan = {"baseFixture": BASE_FIXTURE, "sources": SOURCES,
            "order": [f"{label}-observer-{'on' if enabled else 'off'}" for label, enabled in ARMS],
            "originalJourney": True, "originalJourneyHomeWaitSeconds": 30,
            "originalXCTestStatusWaitSeconds": 35,
            "freshSimulatorEachArm": True, "warmRunAcceptance": False,
            "releaseOrStoreAction": False}
    if not args.execute:
        print(json.dumps(plan, indent=2))
        return 0
    if not args.fixture_sha:
        parser.error("--fixture-sha is required with --execute")
    fixture_sha, fixture_tree, apps = verify_inputs(args.fixture_sha)
    output_dir = FIXTURE_ROOT / "build/startup-ab"
    output_dir.mkdir(parents=True, exist_ok=False)
    runtime, device = simulator_target()
    host = {"fixtureSha": fixture_sha, "fixtureTree": fixture_tree,
            "hostnameSha256": hashlib.sha256(platform.node().encode()).hexdigest(),
            "runnerOs": platform.platform(), "machine": platform.machine(),
            "xcode": output(["xcodebuild", "-version"]),
            "runtimeIdentifier": runtime["identifier"], "runtimeVersion": runtime["version"],
            "deviceType": device["name"], "startedEpochMs": round(time.time() * 1000)}
    (output_dir / "host.json").write_text(json.dumps(host, indent=2), encoding="utf8")
    records = run_matrix(apps, runtime, device, fixture_sha, fixture_tree, output_dir, host)
    return 0 if diagnostic_complete(records) else 1


if __name__ == "__main__":
    sys.exit(main())
