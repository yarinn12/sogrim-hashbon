"""Read-only original APK audit plus exclusive extraction; never builds an APK."""
import argparse, hashlib, json, pathlib, re, shutil, subprocess, zipfile

SOURCE = "c053989b217740fa9855edfbc2ec83456f498dfc"
TREE = "2b0845ff0be978c344148eb855827beb0d4f7ccb"
TOOLS = "9ee0e857073ff891257189c027efea924dbcb506"
ZIP_SHA = "2a50fda848f13200553c07145253c98d206909eabf696c7ae66238de069d1755"
APK_SHA = "e13e32a4ed5903bf527127e2dee4d039df923b5120f69d11aa63333b3afb28c5"
APK_MEMBER = "android/app/build/outputs/apk/debug/app-debug.apk"
AUDIT_MEMBER = "artifacts/android-native-isolated/apk-assets.json"
FIXTURE_MEMBER = "artifacts/android-native-isolated/fixture-provenance.json"

def digest(data):
    return hashlib.sha256(data).hexdigest()

def require_safe_entries(entries):
    names = set()
    if len(entries) > 10000 or sum(e.file_size for e in entries) > 2 * 1024**3:
        raise ValueError("Archive bounds exceeded")
    for entry in entries:
        name = entry.filename
        path = pathlib.PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or "\\" in name or ":" in name or "\0" in name:
            raise ValueError("Unsafe archive path")
        if name in names or ((entry.external_attr >> 16) & 0o170000) == 0o120000:
            raise ValueError("Duplicate or symlink archive entry")
        names.add(name)

def verify(archive, source_root, tools_root, destination):
    archive, source_root, tools_root, destination = map(pathlib.Path, (archive, source_root, tools_root, destination))
    if archive.stat().st_size != 121573483 or digest(archive.read_bytes()) != ZIP_SHA:
        raise ValueError("Original ZIP bytes/hash mismatch")
    for root, expected in [(source_root, SOURCE), (tools_root, TOOLS)]:
        git = lambda *args: subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()
        if git("rev-parse", "HEAD") != expected or git("rev-parse", "HEAD^{tree}") != TREE or git("status", "--porcelain"):
            raise ValueError("Wrong or dirty source/tools checkout")
    if destination.exists():
        raise ValueError("Refuse overwrite of original extraction")
    with zipfile.ZipFile(archive) as z:
        require_safe_entries(z.infolist())
        if z.testzip() is not None:
            raise ValueError("ZIP CRC failure")
        apk = z.read(APK_MEMBER)
        if len(apk) != 23883384 or digest(apk) != APK_SHA:
            raise ValueError("Original APK bytes/hash mismatch")
        audit = json.loads(z.read(AUDIT_MEMBER))
        fixture = json.loads(z.read(FIXTURE_MEMBER))
        for data in (audit, fixture):
            if data["sourceCommit"] != SOURCE or data["sourceTree"] != TREE or not data["nativeDiagnosticAbsent"]:
                raise ValueError("Artifact source/tree/diagnostic mismatch")
        if not audit["ready"] or audit["errors"] or audit["apkSha256"] != APK_SHA:
            raise ValueError("Original audit failed or wrong APK")
        if not fixture["privateEnvDisabled"] or not fixture["bootstrapIsSynthetic"] or fixture["runtimeSourceChanged"] or fixture["productCssChanged"]:
            raise ValueError("Private/changed bootstrap is forbidden")
        if z.read("artifacts/android-native-isolated/qa-tools-source.txt").decode().strip() != TOOLS:
            raise ValueError("Wrong original QA tools")
        if len(audit["assets"]) != 214 or sum(bool(a["font"]) for a in audit["assets"]) != 13:
            raise ValueError("Missing assets/fonts")
        with zipfile.ZipFile(__import__("io").BytesIO(apk)) as package:
            require_safe_entries(package.infolist())
            embedded = {e.filename[len("assets/public/"):] for e in package.infolist() if not e.is_dir() and e.filename.startswith("assets/public/")}
            if embedded != {a["path"] for a in audit["assets"]}:
                raise ValueError("APK asset inventory mismatch")
            for asset in audit["assets"]:
                data = package.read("assets/public/" + asset["path"])
                stub = asset["path"] in ("cordova.js", "cordova_plugins.js") and asset["emptyGeneratedStub"] and not asset["font"] and not data
                if digest(data) != asset["sha256"] or len(data) != asset["length"] or not (asset["matchesWww"] or stub) or not asset["fontMatchesSource"]:
                    raise ValueError("Embedded asset mismatch: " + asset["path"])
                if asset["font"]:
                    raw = subprocess.check_output(["git", "-C", str(source_root), "show", SOURCE + ":" + asset["path"]])
                    if raw != data:
                        raise ValueError("Font differs from canonical Git: " + asset["path"])
        destination.mkdir(parents=True)
        z.extractall(destination)
    return {"source": SOURCE, "tree": TREE, "tools": TOOLS, "zipSha256": ZIP_SHA, "zipBytes": 121573483,
            "apkSha256": APK_SHA, "apkBytes": len(apk), "assets": 214, "fonts": 13,
            "privateEnvDisabled": True, "syntheticBootstrap": True, "APKExecuted": False, "releaseAcceptance": False}

def seed(original, app_root):
    original, app_root = pathlib.Path(original), pathlib.Path(app_root)
    paths = [APK_MEMBER, AUDIT_MEMBER, FIXTURE_MEMBER, "artifacts/android-native-isolated/qa-tools-source.txt"]
    for member in paths:
        target = app_root / member
        if target.exists():
            raise ValueError("Refuse overwrite of fresh arm seed: " + member)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original / member, target)
    if digest((app_root / APK_MEMBER).read_bytes()) != APK_SHA:
        raise ValueError("Seed APK changed")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="mode", required=True)
    audit = sub.add_parser("verify")
    for option in ("archive", "source-root", "tools-root", "destination"):
        audit.add_argument("--" + option, required=True)
    prepare = sub.add_parser("seed")
    prepare.add_argument("--original", required=True)
    prepare.add_argument("--app-root", required=True)
    args = parser.parse_args()
    if args.mode == "seed":
        seed(args.original, args.app_root)
        print(json.dumps({"seeded": True, "apkSha256": APK_SHA, "APKRebuilt": False}))
    else:
        print(json.dumps(verify(args.archive, args.source_root, args.tools_root, args.destination)))
