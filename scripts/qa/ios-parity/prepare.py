"""Instrument a pinned unsigned simulator checkout; never alter a release IPA."""
from hashlib import sha256
from pathlib import Path
import json
import math
import plistlib
import re
import subprocess
import sys
from urllib.parse import urlsplit

FIXTURES = Path(__file__).parent


def prepare(app: Path, source_sha: str) -> None:
    assert re.fullmatch(r"[0-9a-f]{40}", source_sha)
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=app, text=True).strip() == source_sha
    out = app / "build/native-parity"
    out.mkdir(parents=True, exist_ok=True)
    public = app / "ios/App/App/public"
    assert public.is_dir()
    source_tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=app, text=True).strip()
    manifest = {"sourceSha": source_sha, "sourceTree": source_tree, "source": {}, "www": {}, "qaFixtures": {}}
    for path in sorted(FIXTURES.iterdir()):
        if path.is_file():
            manifest["qaFixtures"][path.name] = sha256(path.read_bytes()).hexdigest()
    for path in sorted((app / "src").glob("public*Layer.mjs")):
        manifest["source"][str(path.relative_to(app))] = sha256(path.read_bytes()).hexdigest()
    for path in sorted(public.rglob("*")):
        if path.is_file():
            manifest["www"][str(path.relative_to(public))] = sha256(path.read_bytes()).hexdigest()
    (out / "package-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
    for name in ["synthetic-service", "journey"]:
        (public / f"ios-parity-{name}.js").write_bytes((FIXTURES / f"{name}.js").read_bytes())
    delegate = app / "ios/App/App/AppDelegate.swift"
    source = delegate.read_text(encoding="utf8")
    assert "class SogrimBridgeViewController: CAPBridgeViewController" in source
    assert source.count("import AuthenticationServices") == 1
    source = source.replace("import AuthenticationServices", "import AuthenticationServices\nimport WebKit")
    source += (FIXTURES / "ParityBridge.swift").read_text(encoding="utf8").replace("__APP_SHA__", source_sha).replace("__APP_TREE__", source_tree)
    delegate.write_text(source, encoding="utf8")
    story = app / "ios/App/App/Base.lproj/Main.storyboard"
    markup = story.read_text(encoding="utf8")
    assert markup.count('customClass="SogrimBridgeViewController"') == 1
    story.write_text(markup.replace('customClass="SogrimBridgeViewController"', 'customClass="SogrimParityBridgeViewController"'), encoding="utf8")
    install_test_target(app)
    print(json.dumps({"sourceSha": source_sha, "controller": "SogrimBridgeViewController", "unsigned": True, "wwwFiles": len(manifest["www"])}))


def install_test_target(app: Path) -> None:
    project = app / "ios/App/App.xcodeproj/project.pbxproj"
    model = json.loads(subprocess.check_output(["plutil", "-convert", "json", "-o", "-", str(project)]))
    objects = model["objects"]
    app_target = "504EC3031FED79650016851F"
    assert objects[app_target]["name"] == "App"
    keys = ["AC101026000000000000" + str(index).zfill(4) for index in range(12)]
    assert all(key not in objects for key in keys)
    target, product, file, build, sources, frameworks, resources, configs, debug, release, dependency, proxy = keys
    objects[file] = {"isa": "PBXFileReference", "lastKnownFileType": "sourcecode.swift", "path": "ParityProbeUITests.swift", "sourceTree": "SOURCE_ROOT"}
    objects[build] = {"isa": "PBXBuildFile", "fileRef": file}
    objects[product] = {"isa": "PBXFileReference", "explicitFileType": "wrapper.cfbundle", "includeInIndex": "0", "path": "ParityProbeUITests.xctest", "sourceTree": "BUILT_PRODUCTS_DIR"}
    for identifier, kind, files in [(sources, "PBXSourcesBuildPhase", [build]), (frameworks, "PBXFrameworksBuildPhase", []), (resources, "PBXResourcesBuildPhase", [])]:
        objects[identifier] = {"isa": kind, "buildActionMask": "2147483647", "files": files, "runOnlyForDeploymentPostprocessing": "0"}
    settings = {"CLANG_ENABLE_MODULES": "YES", "SWIFT_VERSION": "5.0", "IPHONEOS_DEPLOYMENT_TARGET": "15.0", "PRODUCT_BUNDLE_IDENTIFIER": "com.sogrimhashbon.parityprobe", "PRODUCT_NAME": "$(TARGET_NAME)", "GENERATE_INFOPLIST_FILE": "YES", "TARGETED_DEVICE_FAMILY": "1,2", "TEST_TARGET_NAME": "App", "CODE_SIGNING_ALLOWED": "NO", "SDKROOT": "iphoneos"}
    for identifier, name in [(debug, "Debug"), (release, "Release")]:
        objects[identifier] = {"isa": "XCBuildConfiguration", "buildSettings": settings, "name": name}
    objects[configs] = {"isa": "XCConfigurationList", "buildConfigurations": [debug, release], "defaultConfigurationIsVisible": "0", "defaultConfigurationName": "Debug"}
    objects[proxy] = {"isa": "PBXContainerItemProxy", "containerPortal": model["rootObject"], "proxyType": "1", "remoteGlobalIDString": app_target, "remoteInfo": "App"}
    objects[dependency] = {"isa": "PBXTargetDependency", "target": app_target, "targetProxy": proxy}
    objects[target] = {"isa": "PBXNativeTarget", "buildConfigurationList": configs, "buildPhases": [sources, frameworks, resources], "buildRules": [], "dependencies": [dependency], "name": "ParityProbeUITests", "productName": "ParityProbeUITests", "productReference": product, "productType": "com.apple.product-type.bundle.ui-testing"}
    objects["504EC2FB1FED79650016851F"]["children"].append(file)
    objects["504EC3051FED79650016851F"]["children"].append(product)
    objects[model["rootObject"]]["targets"].append(target)
    objects[model["rootObject"]]["attributes"]["TargetAttributes"][target] = {"CreatedOnToolsVersion": "26.6", "TestTargetID": app_target}
    with project.open("wb") as stream:
        plistlib.dump(model, stream)
    scheme = app / "ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"
    content = scheme.read_text(encoding="utf8")
    reference = f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="ParityProbeUITests.xctest" BlueprintName="ParityProbeUITests" ReferencedContainer="container:App.xcodeproj"/>'
    assert content.count("<Testables>") == 1 and content.count("<BuildActionEntries>") == 1
    content = content.replace("<Testables>", '<Testables><TestableReference skipped="NO">' + reference + '</TestableReference>')
    content = content.replace("<BuildActionEntries>", '<BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="NO">' + reference + '</BuildActionEntry>')
    scheme.write_text(content, encoding="utf8")
    (app / "ios/App/ParityProbeUITests.swift").write_bytes((FIXTURES / "ParityUITests.swift").read_bytes())


def validate(out: Path, source_sha: str) -> None:
    manifest = json.loads((out / "package-manifest.json").read_text(encoding="utf8"))
    assert manifest["sourceSha"] == source_sha and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceTree"])
    reports = {}
    for mode in ["default", "accessibility-extra-large"]:
        report = json.loads((out / mode / "native-parity.json").read_text(encoding="utf8"))
        assert report["sourceSha"] == source_sha
        assert report["controller"] == "SogrimParityBridgeViewController"
        assert report["sourceTree"] == manifest["sourceTree"]
        assert report["preferredContentSizeCategory"] == report["webViewContentSizeCategory"]
        records = {record["phase"]: record for record in report["records"]}
        assert not records.get("error"), records.get("error")
        for phase in ["home", "expenses", "summary", "transfers", "notes", "note-opened", "profile", "keyboard-amount", "keyboard-name", "saved", "resumed", "restored"]:
            record = records[phase]
            native = record["native"]
            assert math.isclose(native["nativeZoomScale"], 1, abs_tol=0.001)
            assert native["bridgeAvailable"] is True and native["sourceTree"] == manifest["sourceTree"]
            for url in [native["webViewUrl"], record["appUrl"]]:
                parsed = urlsplit(url)
                assert parsed.scheme == "capacitor" and parsed.hostname == "localhost" and parsed.port is None
            assert native["safeArea"]["top"] > 0 and native["safeArea"]["bottom"] > 0
            window, webview, bar = native["windowBounds"], native["webViewFrame"], native["statusBarFrame"]
            assert window["width"] > 0 and window["height"] > 0
            assert webview["width"] > 0 and webview["height"] > 0
            assert 0 <= webview["x"] and webview["x"] + webview["width"] <= window["width"] + 1
            assert 0 <= webview["y"] and webview["y"] + webview["height"] <= window["height"] + 1
            assert bar["height"] > 0 and bar["y"] + bar["height"] <= native["safeArea"]["top"] + 1
            assert record["nativeShell"] is True and record["platform"] == "ios"
            assert record["nativeAppInfo"]["id"] == "com.sogrimhashbon.app"
            assert record["errors"] == []
            assert record["documentWidth"] <= record["viewport"]["width"] + 1
            assert record["viewport"]["height"] > record["viewport"]["width"]
            assert record["rootFontSize"] > 0 and record["metrics"]
            for key, metric in record["metrics"].items():
                bounds, mapped = metric["bounds"], metric["nativeBounds"]
                scroll, frame, offset = record["documentScroll"], native["scrollViewFrame"], native["nativeContentOffset"]
                dx, dy = frame["x"] + scroll["x"] - offset["x"], frame["y"] + scroll["y"] - offset["y"]
                for axis, delta in [("left", dx), ("right", dx), ("top", dy), ("bottom", dy)]:
                    assert math.isclose(mapped[axis], bounds[axis] + delta, abs_tol=1), (phase, key, axis)
                if phase == "home":
                    assert mapped["top"] >= bar["y"] + bar["height"] - 1
                assert metric["text"] and metric["width"] > 0 and metric["fontSize"] > 0
                preview_ellipsis = phase == "notes" and key in ["title", "preview"] and metric.get("textOverflow") == "ellipsis" and metric.get("overflowX") == "hidden"
                assert metric["clientWidth"] > 0
                if not metric.get("isTextControl"):
                    assert metric["words"] and all(word["rows"] >= 1 for word in metric["words"])
                if not preview_ellipsis:
                    assert metric["scrollWidth"] <= metric["clientWidth"] + 1
                    assert metric["horizontalGlyphOverflow"] is False
                    assert metric["clippedByAncestor"] is False
            screenshot = out / mode / f"native-parity-{phase}.png"
            assert screenshot.is_file() and screenshot.stat().st_size > 1000
        saved = records["saved"]
        assert "שם ארוך" in records["transfers"]["metrics"]["longName"]["text"]
        opened = records["note-opened"]["openedNote"]
        assert opened["title"] == records["notes"]["metrics"]["title"]["text"]
        assert opened["body"] == records["notes"]["metrics"]["preview"]["text"]
        for phase, field in [("keyboard-amount", "amount"), ("keyboard-name", "name")]:
            record = records[phase]
            assert record["native"]["keyboardShows"] > 0 and record["native"]["keyboardFrame"]["height"] > 0
            assert record["native"]["keyboardFrame"]["y"] < record["native"]["windowBounds"]["height"]
            viewport = record["viewport"]
            assert 0 < viewport["visualHeight"] < viewport["height"]
            for key in [field, "next"]:
                bounds = record["metrics"][key]["bounds"]
                assert bounds["top"] >= viewport["visualTop"] - 1
                assert bounds["bottom"] <= viewport["visualTop"] + viewport["visualHeight"] + 1
                mapped = record["metrics"][key]["nativeBounds"]
                assert mapped["top"] >= record["native"]["statusBarFrame"]["y"] + record["native"]["statusBarFrame"]["height"] - 1
                assert mapped["bottom"] <= record["native"]["keyboardFrame"]["y"] + 1
            frame, offset, scroll = record["native"]["scrollViewFrame"], record["native"]["nativeContentOffset"], record["documentScroll"]
            visual_bottom = frame["y"] + scroll["y"] - offset["y"] + viewport["visualTop"] + viewport["visualHeight"]
            assert math.isclose(visual_bottom, record["native"]["keyboardFrame"]["y"], abs_tol=1)
            action, value = ("expense-total", "120") if field == "amount" else ("expense-name", "QA iOS")
            assert any(item["action"] == action and item["value"] == value for item in record["trustedInputs"])
        assert all(any(item["action"] == action for item in saved["trustedClicks"]) for action in ["expense-step-next", "save-expense"])
        assert records["resumed"]["native"]["backgrounds"] > 0 and records["resumed"]["native"]["foregrounds"] > 0
        for key in ["tab", "tab2", "tab3"]:
            metric = records["expenses"]["metrics"][key]
            assert metric["words"] and all(word["rows"] == 1 and word["outsideTab"] is False for word in metric["words"]), key
        assert saved["native"]["keyboardShows"] > 0
        assert saved["writes"] and saved["pendingOutbox"] == []
        for phase in ["saved", "restored"]:
            assert any(expense["name"] == "QA iOS" and expense["total"] == 12000 for expense in records[phase]["saved"]["state"]["events"][0]["expenses"])
        assert "QA iOS" in records["restored"]["metrics"]["expense"]["text"]
        reports[mode] = report
    normal, enlarged = reports["default"], reports["accessibility-extra-large"]
    assert normal["preferredContentSizeCategory"] == "UICTContentSizeCategoryL"
    assert enlarged["preferredContentSizeCategory"] == "UICTContentSizeCategoryAccessibilityXL"
    assert enlarged["nativeBodyPointSize"] > normal["nativeBodyPointSize"]
    factor = enlarged["nativeBodyPointSize"] / normal["nativeBodyPointSize"]
    for phase in ["home", "expenses", "summary", "transfers", "notes", "profile"]:
        a = next(record for record in normal["records"] if record["phase"] == phase)
        b = next(record for record in enlarged["records"] if record["phase"] == phase)
        assert math.isclose(b["rootFontSize"], a["rootFontSize"] * factor, abs_tol=0.002)
        for key, metric in a["metrics"].items():
            assert math.isclose(b["metrics"][key]["fontSize"], metric["fontSize"] * factor, abs_tol=0.2), (phase, key)
    print(json.dumps({"sourceSha": source_sha, "status": "passed", "nativeController": normal["controller"], "iOS": normal["systemVersion"], "categories": [normal["preferredContentSizeCategory"], enlarged["preferredContentSizeCategory"]]}))


if __name__ == "__main__":
    assert len(sys.argv) == 4
    command, location, sha = sys.argv[1:]
    if command == "prepare":
        prepare(Path(location).resolve(), sha)
    elif command == "validate":
        validate(Path(location).resolve(), sha)
    else:
        raise ValueError(command)
