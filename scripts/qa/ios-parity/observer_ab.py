"""Local artifact hashes and fail-closed receipt for the one-off iOS observer A/B."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import re
import sys

SOURCE_SHA = "52dc1c737fcb95bbe03f6cde9e495877ca6a765c"
SOURCE_TREE = "76cc019ee0bbdcc6006753656f88ef1e5e7a58dc"
CATEGORIES = ("default", "accessibility-extra-large")


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def digest_directory(directory: Path) -> str:
    assert directory.is_dir(), f"missing directory: {directory}"
    digest = hashlib.sha256()
    for path in sorted(directory.rglob("*"), key=lambda item: item.relative_to(directory).as_posix()):
        relative = path.relative_to(directory).as_posix().encode("utf8")
        if path.is_symlink():
            kind, content = b"link", path.readlink().as_posix().encode("utf8")
        elif path.is_file():
            kind, content = b"file", digest_file(path).encode("ascii")
        elif path.is_dir():
            kind, content = b"dir", b""
        else:
            raise AssertionError(f"unsupported product: {path}")
        for value in (kind, relative, content):
            digest.update(len(value).to_bytes(8, "big"))
            digest.update(value)
    return digest.hexdigest()


def snapshot(products: Path) -> dict:
    assert products.is_dir(), "missing Build/Products"
    apps = sorted(path for path in products.rglob("App.app") if path.is_dir())
    runs = sorted(products.glob("*.xctestrun"))
    assert len(apps) == 1, f"expected one App.app, found {len(apps)}"
    assert len(runs) == 1, f"expected one xctestrun, found {len(runs)}"
    return {
        "appPath": apps[0].relative_to(products).as_posix(),
        "appSha256": digest_directory(apps[0]),
        "xctestrunPath": runs[0].relative_to(products).as_posix(),
        "xctestrunSha256": digest_file(runs[0]),
        "productsSha256": digest_directory(products),
    }


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf8"))


def finite_number(value) -> bool:
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def whole_number(value) -> bool:
    return finite_number(value) and value == int(value)


def home_wait_errors(directory: Path, label: str) -> list[str]:
    errors = []
    try:
        report = read_json(directory / "native-parity.json")
        records = report["records"]
        sessions = [row["captureSession"] for row in records]
        assert report["sourceSha"] == SOURCE_SHA and report["sourceTree"] == SOURCE_TREE
        assert len(sessions) == 13 and len(set(sessions)) == 2
        assert all(session == sessions[0] for session in sessions[:-1])
        assert sessions[-1] != sessions[0]
        assert all(isinstance(session, str) and re.fullmatch(r"[0-9A-Fa-f-]{36}", session)
                   for session in sessions)
    except (OSError, UnicodeError, ValueError, KeyError, TypeError, AssertionError):
        return [f"{label} missing or invalid home wait evidence"]
    for session in (sessions[0], sessions[-1]):
        try:
            path = directory / f"native-parity-startup-{session}.log"
            rows = [json.loads(line) for line in path.read_text(encoding="utf8").splitlines()
                    if line.strip()]
            assert rows and all(isinstance(row, dict) for row in rows)
        except (OSError, UnicodeError, ValueError, AssertionError):
            errors.append(f"{label} missing or invalid home wait evidence: {session}")
            continue
        if any(row.get("session") != session or row.get("sourceSha") != SOURCE_SHA
               or row.get("sourceTree") != SOURCE_TREE or row.get("fixtureSha") != SOURCE_SHA
               or row.get("fixtureTree") != SOURCE_TREE for row in rows):
            errors.append(f"{label} invalid home wait identity: {session}")
        home = [row for row in rows if isinstance(row.get("stage"), str)
                and row["stage"].startswith("home-wait-")]
        if ([row["stage"] for row in home] != ["home-wait-start", "home-wait-ready"]
                or any(row.get("event") != "web-stage" for row in home)):
            errors.append(f"{label} incomplete or failed home wait: {session}")
            continue
        start, ready = home
        deadline = start.get("deadlineEpochMs")
        if not (whole_number(deadline) and deadline > 0
                and whole_number(ready.get("deadlineEpochMs"))
                and ready["deadlineEpochMs"] == deadline
                and all(whole_number(row.get("timeoutMs")) and row["timeoutMs"] == 30000
                        for row in home)
                and whole_number(start.get("probeCount")) and start["probeCount"] == 0
                and whole_number(ready.get("probeCount")) and ready["probeCount"] > 0):
            errors.append(f"{label} invalid home wait timing fields: {session}")
        if not (ready.get("homeVisible") is True
                and whole_number(ready.get("homeCount")) and ready["homeCount"] > 0
                and finite_number(ready.get("homeWidth")) and ready["homeWidth"] > 0
                and finite_number(ready.get("homeHeight")) and ready["homeHeight"] > 0):
            errors.append(f"{label} invalid ready home geometry: {session}")
    return errors


def check_run(root: Path) -> list[str]:
    errors: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    try:
        plan = read_json(root / "plan.json")
    except (OSError, ValueError) as error:
        return [f"missing or invalid plan: {error}"]
    order = plan.get("order")
    require(order in (["on", "off"], ["off", "on"]), "missing, repeated or invalid arm order")
    require(plan.get("sourceSha") == SOURCE_SHA and plan.get("sourceTree") == SOURCE_TREE,
            "application source drift")
    require(plan.get("fixtureSha") == SOURCE_SHA and plan.get("fixtureTree") == SOURCE_TREE,
            "QA fixture drift")
    runner = plan.get("runnerSha")
    require(isinstance(runner, str) and re.fullmatch(r"[0-9a-f]{40}", runner) is not None
            and runner != SOURCE_SHA, "invalid or mixed control runner SHA")
    require(plan.get("diagnosticOnly") is True and plan.get("releaseAcceptance") is False,
            "diagnostic result must not become release acceptance")
    require(plan.get("runtimeVersion") == "26.5" and plan.get("deviceName") == "iPhone 16",
            "SDK/device drift")
    try:
        build_lines = (root / "build-invocations.txt").read_text(encoding="utf8").splitlines()
        require(build_lines == ["build-for-testing"], "build counter must be exactly one")
    except OSError:
        errors.append("missing build counter")
    try:
        executed = (root / "executed-order.txt").read_text(encoding="utf8").splitlines()
        require(executed == order, "missing, repeated or reordered arm execution")
    except OSError:
        errors.append("missing arm execution receipt")
    try:
        baseline = read_json(root / "baseline.json")
        require(all(isinstance(baseline.get(key), str) and baseline[key] for key in
                    ("appPath", "appSha256", "xctestrunPath", "xctestrunSha256", "productsSha256")),
                "incomplete build hash baseline")
    except (OSError, ValueError) as error:
        errors.append(f"missing build hash baseline: {error}")
        baseline = None
    udids = []
    for arm in ("on", "off"):
        directory = root / arm
        shutdown = {}
        require(directory.is_dir(), f"missing {arm} arm")
        require(not (directory / "host-diagnostics-unconfirmed.txt").exists(),
                f"{arm} host diagnostic cleanup is unconfirmed")
        for name in ("before.json", "after.json"):
            try:
                require(read_json(directory / name) == baseline, f"{arm} {name} build hash drift")
            except (OSError, ValueError):
                errors.append(f"missing {arm} {name} build hash")
        try:
            require((directory / "exit-code.txt").read_text(encoding="utf8").strip() == "0",
                    f"{arm} arm failed")
            require((directory / "parent-exit-code.txt").read_text(encoding="utf8").strip() == "0",
                    f"{arm} child process failed")
        except OSError:
            errors.append(f"missing {arm} arm exit")
        try:
            shutdown = read_json(directory / "shutdown.json")
            require(shutdown.get("state") == "Shutdown", f"{arm} simulator was not shut down")
            udids.append(shutdown.get("udid"))
            simulator = read_json(directory / "simulator.json")
            require(simulator.get("udid") == shutdown.get("udid")
                    and simulator.get("runtimeId") == plan.get("runtimeId")
                    and simulator.get("deviceTypeId") == plan.get("deviceTypeId"),
                    f"{arm} simulator identity drift")
        except (OSError, ValueError):
            errors.append(f"missing {arm} simulator or shutdown receipt")
        for category in CATEGORIES:
            path = directory / category
            try:
                require((path / "test-started.txt").read_text(encoding="utf8").splitlines()
                        == ["test-without-building"], f"{arm}/{category} test counter differs from one")
                require((path / "exit-code.txt").read_text(encoding="utf8").strip() == "0",
                        f"{arm}/{category} failed")
                require((path / "observer-state.txt").read_text(encoding="utf8").strip() == arm,
                        f"{arm}/{category} observer state drift")
            except OSError:
                errors.append(f"missing {arm}/{category} test receipt")
            observer = path / "observer"
            if arm == "on":
                try:
                    require((observer / "exit-code.txt").read_text(encoding="utf8").strip() == "0",
                            f"{arm}/{category} observer failed")
                    report = read_json(observer / "monitor-report.json")
                    require(report.get("udid") == shutdown.get("udid")
                            and report.get("sourceSha") == SOURCE_SHA
                            and report.get("sourceTree") == SOURCE_TREE
                            and report.get("status") in ("sampled", "no-sample", "sample-command-failed"),
                            f"{arm}/{category} observer did not run against the pinned app")
                except (OSError, ValueError):
                    errors.append(f"missing {arm}/{category} observer receipt")
            else:
                require(not observer.exists(), f"{arm}/{category} off arm ran observer")
            errors.extend(home_wait_errors(path, f"{arm}/{category}"))
        try:
            require((directory / "validation.exit-code.txt").read_text(encoding="utf8").strip() == "0",
                    f"{arm} original prepare.py validation failed")
        except OSError:
            errors.append(f"missing {arm} validation receipt")
    require(len(udids) == 2 and all(isinstance(udid, str) and udid for udid in udids)
            and udids[0] != udids[1], "arms must use distinct simulator UDIDs")
    return errors


def main() -> int:
    command, *args = sys.argv[1:]
    if command == "snapshot" and len(args) == 2:
        products, output = map(Path, args)
        output.write_text(json.dumps(snapshot(products), indent=2) + "\n", encoding="utf8")
        return 0
    if command == "verify" and len(args) == 1:
        root = Path(args[0])
        errors = check_run(root)
        result = {"diagnosticOnly": True, "releaseAcceptance": False,
                  "status": "failed" if errors else "passed", "errors": errors}
        (root / "diagnostic-result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
        print(json.dumps(result))
        return 1 if errors else 0
    raise SystemExit("usage: observer_ab.py snapshot PRODUCTS OUTPUT | verify ROOT")


if __name__ == "__main__":
    raise SystemExit(main())
