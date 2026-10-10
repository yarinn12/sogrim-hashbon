"""Prepare and validate an unsigned, QA-only iPhone WKWebView typography probe.

The app checkout is modified only inside the CI job. No production source, signing
setting, release artifact, or App Store service is changed by this fixture.
"""

from hashlib import sha256
from pathlib import Path
import json
import plistlib
import re
import subprocess
import sys


OWNER = "person-ios-typography-owner"
PEER = "account-12345678-1234-4123-8123-123456789abc"
ARIEL = "person-ios-typography-ariel"
HAREL = "person-ios-typography-harel"
EVENT = "event-ios-typography"
SEED = {
    "currentParticipantId": OWNER,
    "participants": [
        {"id": OWNER, "displayName": "ירין יצחק", "kind": "user", "avatarPreset": "avatar-1"},
        {"id": PEER, "displayName": "Awesome Maor · מאור סיבוני", "kind": "user",
         "avatarPreset": "avatar-2", "accountLinked": True, "username": "awesome_maor"},
        {"id": ARIEL, "displayName": "אריאל ניזרי מהטיול המשפחתי", "kind": "guest"},
        {"id": HAREL, "displayName": "הראל כהן", "kind": "guest"},
    ],
    "friendContacts": [], "groups": [], "deletedEvents": [], "deletedParticipants": [],
    "events": [{
        "id": EVENT, "name": "סופ״ש Lisbon 2026 · משפחת כהן", "eventType": "trip",
        "currency": "ILS", "participantIds": [OWNER, PEER, ARIEL, HAREL], "adminIds": [OWNER],
        "createdByParticipantId": OWNER, "createdAt": "2026-10-01T08:00:00.000Z",
        "updatedAt": "2026-10-01T08:00:01.000Z", "statusUpdatedAt": "2026-10-01T08:00:01.000Z",
        "roundSettlementTransfers": True,
        "directSettlementTransfers": False, "locked": False,
        "expenses": [{
            "id": "expense-typography-dinner", "name": "ארוחת ערב במסעדת השוק", "total": 24000,
            "payers": [{"participantId": OWNER, "amount": 24000}],
            "sharedByParticipantIds": [OWNER, PEER, ARIEL, HAREL],
            "createdByParticipantId": OWNER, "occurredOn": "2026-10-01",
            "updatedAt": "2026-10-01T08:00:01.000Z",
        }, {
            "id": "expense-typography-taxi", "name": "Taxi to Tel Aviv · מונית חזרה", "total": 7600,
            "payers": [{"participantId": PEER, "amount": 7600}],
            "sharedByParticipantIds": [OWNER, PEER, ARIEL],
            "createdByParticipantId": PEER, "occurredOn": "2026-10-01",
            "updatedAt": "2026-10-01T08:00:01.000Z",
        }],
        "transfers": [],
        "activityLog": [],
    }],
}

LAUNCH_NEEDLE = "        // Override point for customization after application launch.\n        return true"
LAUNCH_REPLACEMENT = """        // QA copy only: exercise the pinned web source in an actual iOS WKWebView.
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = TypographyProbeController()
        window?.makeKeyAndVisible()
        return true"""

SWIFT_PROBE = r'''

// QA-only controller appended to the temporary simulator checkout by prepare.py.
final class TypographyProbeController: UIViewController, WKScriptMessageHandler {
    private var webView: WKWebView!
    private var records: [[String: Any]] = []
    private var errors: [String] = []
    private let sourceSha = "__SOURCE_SHA__"

    override func viewDidLoad() {
        super.viewDidLoad()
        let configuration = WKWebViewConfiguration()
        let path = Bundle.main.resourceURL!.appendingPathComponent("public/typography-probe.js")
        let fixture = try! String(contentsOf: path, encoding: .utf8)
        configuration.userContentController.addUserScript(WKUserScript(
            source: fixture, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(self, name: "typography")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        webView.load(URLRequest(url: URL(string: "http://127.0.0.1:8765/?typography_probe=normal")!))
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let record = message.body as? [String: Any],
              let phase = record["phase"] as? String else {
            errors.append("Malformed WebKit probe message")
            writeReport(complete: false)
            return
        }
        if record["sourceSha"] as? String != sourceSha {
            errors.append("WebKit fixture source SHA mismatch")
        }
        records.append(record)
        print("TYPOGRAPHY_PROBE_PHASE:" + phase)
        webView.takeSnapshot(with: nil) { [weak self] image, error in
            guard let self = self else { return }
            if let error = error { self.errors.append("Snapshot " + phase + ": " + error.localizedDescription) }
            if let data = image?.pngData() {
                let url = self.documents.appendingPathComponent("typography-" + phase + ".png")
                do { try data.write(to: url) }
                catch { self.errors.append("Writing " + phase + " snapshot: " + error.localizedDescription) }
            } else { self.errors.append("No image for " + phase) }
            let phases = self.records.compactMap { $0["phase"] as? String }
            let complete = phases == ["home", "summary", "share", "repayment"] && self.errors.isEmpty
            self.writeReport(complete: complete)
            self.webView.evaluateJavaScript("window.__typographyProbeContinue?.()", completionHandler: nil)
        }
    }

    private var documents: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    private func writeReport(complete: Bool) {
        let result: [String: Any] = [
            "sourceSha": sourceSha, "complete": complete, "errors": errors,
            "deviceName": UIDevice.current.name, "deviceModel": UIDevice.current.model,
            "systemName": UIDevice.current.systemName,
            "systemVersion": UIDevice.current.systemVersion,
            "preferredContentSizeCategory": UIApplication.shared.preferredContentSizeCategory.rawValue,
            "nativeBodyPointSize": UIFont.preferredFont(forTextStyle: .body).pointSize,
            "screenScale": UIScreen.main.scale, "records": records
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: result,
                                                  options: [.prettyPrinted, .sortedKeys])
            try data.write(to: documents.appendingPathComponent("typography-report.json"))
        } catch { print("TYPOGRAPHY_PROBE_WRITE_ERROR:" + error.localizedDescription) }
    }
}
'''


def source_hashes(app: Path, source_sha: str) -> dict:
    files = ["index.html", "styles.css", "src/publicDynamicTypeLayer.mjs",
             "assets/fonts/local.css", "assets/fonts/rubik-hebrew-v31.woff2",
             "assets/fonts/rubik-latin-v31.woff2", "assets/fonts/inter-latin-v20.woff2"]
    return {"sourceSha": source_sha,
            "files": {name: sha256((app / name).read_bytes()).hexdigest() for name in files}}


def seeded_state(app: Path) -> dict:
    # Use the pinned application's real settlement calculation, as its normal
    # mobile fixture does. This keeps the summary and transfer copy representative.
    code = """import {readFileSync} from 'node:fs';
import {calculateSettlement} from './src/domain/settlement.mjs';
const state=JSON.parse(readFileSync(0,'utf8'));
const event=state.events[0];
event.transfers=calculateSettlement(state.participants,event.expenses,
  {roundTransfers:true}).transfers.map(transfer=>({...transfer,status:'pending'}));
console.log(JSON.stringify(state));"""
    result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=app,
                            input=json.dumps(SEED, ensure_ascii=False), text=True,
                            capture_output=True, check=True)
    return json.loads(result.stdout)


def prepare(app: Path, source_sha: str) -> None:
    assert re.fullmatch(r"[0-9a-f]{40}", source_sha), "App SHA must be a full commit hash"
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=app, text=True).strip()
    assert actual == source_sha, f"Expected {source_sha}, checked out {actual}"
    out = app / "build/typography"
    out.mkdir(parents=True, exist_ok=True)
    state = seeded_state(app)
    (out / "seed-state.json").write_text(json.dumps(state, ensure_ascii=False), encoding="utf8")
    (out / "source-hashes.json").write_text(
        json.dumps(source_hashes(app, source_sha), indent=2), encoding="utf8")

    fixture = (Path(__file__).parent / "typography-probe.js").read_text(encoding="utf8")
    assert fixture.count("__TYPOGRAPHY_SOURCE_SHA__") == 1
    assert fixture.count("__TYPOGRAPHY_SEEDED_STATE__") == 1
    fixture = fixture.replace("__TYPOGRAPHY_SOURCE_SHA__", json.dumps(source_sha))
    fixture = fixture.replace("__TYPOGRAPHY_SEEDED_STATE__", json.dumps(state, ensure_ascii=False))
    public = app / "ios/App/App/public"
    assert public.is_dir(), "Run npm run native:prepare before this fixture"
    (public / "typography-probe.js").write_text(fixture, encoding="utf8")

    delegate = app / "ios/App/App/AppDelegate.swift"
    source = delegate.read_text(encoding="utf8")
    assert source.count("import AuthenticationServices") == 1
    assert source.count(LAUNCH_NEEDLE) == 1
    source = source.replace("import AuthenticationServices", "import AuthenticationServices\nimport WebKit")
    source = source.replace(LAUNCH_NEEDLE, LAUNCH_REPLACEMENT)
    source += SWIFT_PROBE.replace("__SOURCE_SHA__", source_sha)
    delegate.write_text(source, encoding="utf8")

    info = app / "ios/App/App/Info.plist"
    with info.open("rb") as file:
        plist = plistlib.load(file)
    plist.pop("UIMainStoryboardFile", None)
    plist["NSAppTransportSecurity"] = {"NSAllowsLocalNetworking": True}
    with info.open("wb") as file:
        plistlib.dump(plist, file)


def validate(out: Path, source_sha: str) -> None:
    report = json.loads((out / "typography-report.json").read_text(encoding="utf8"))
    assert report["sourceSha"] == source_sha
    assert report["complete"] is True, report.get("errors")
    assert report["errors"] == []
    assert report["systemName"] == "iOS"
    assert report["systemVersion"] and report["preferredContentSizeCategory"]
    assert report["nativeBodyPointSize"] > 0
    records = report["records"]
    assert [record["phase"] for record in records] == ["home", "summary", "share", "repayment"]
    assert records[0]["rootDefault"] is True
    assert "dynamic-type-preview" not in records[0]["url"]
    assert all("dynamic-type-preview=32" in record["url"] for record in records[2:])
    required = {"home": ["home"], "summary": ["description", "transferHelper"],
                "share": ["shareButton"], "repayment": ["selectedValue", "directOption"]}
    for record in records:
        assert record["sourceSha"] == source_sha and record["nativeShell"] is False
        assert record["rootFontSize"] and record["loadedFaces"]
        assert any(face["family"].strip("'\"") == "Rubik" for face in record["loadedFaces"])
        for key in required[record["phase"]]:
            metric = record[key]
            assert metric["text"] and metric["width"] > 0 and metric["fontSize"]
            assert metric["wordLines"], (record["phase"], key)
        screenshot = out / f'typography-{record["phase"]}.png'
        assert screenshot.is_file() and screenshot.stat().st_size > 1000, screenshot
    control = records[0]["weightControl"]
    assert [item["weight"] for item in control] == [400, 500, 700, 900]
    assert all(item["inkPixels"] > 0 and item["width"] > 0 for item in control)
    assert records[2]["shareButton"]["fontSize"] == "32px"
    assert records[3]["selectedValue"]["fontSize"] == "32px"
    assert records[3]["directOption"]["fontSize"] == "32px"
    print(json.dumps({"status": "complete", "sourceSha": source_sha,
                      "iOS": report["systemVersion"], "device": report["deviceName"],
                      "contentSize": report["preferredContentSizeCategory"],
                      "phases": [record["phase"] for record in records]}))


if __name__ == "__main__":
    assert len(sys.argv) == 4, "usage: prepare.py prepare|validate APP_OR_OUTPUT_DIR FULL_APP_SHA"
    command, location, source_sha = sys.argv[1:]
    if command == "prepare":
        prepare(Path(location).resolve(), source_sha)
    elif command == "validate":
        validate(Path(location).resolve(), source_sha)
    else:
        raise ValueError(command)
