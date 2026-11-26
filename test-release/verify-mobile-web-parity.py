"""Compare the web content of a signed Android bundle and an iOS build."""

import argparse
import hashlib
import json
import re
import stat
from pathlib import Path, PurePosixPath
from zipfile import ZipFile


ANDROID_PREFIX = "base/assets/public/"
IOS_ENTRY = re.compile(r"^Payload/([^/]+\.app)/public/(.+)$")
TEXT_EXTENSIONS = {".css", ".html", ".js", ".json", ".md", ".mjs", ".svg", ".txt", ".webmanifest"}
BOOTSTRAP_LINE = re.compile(
    r"^[ \t]*<script>globalThis\.SogrimNativeRuntimeConfig=Object\.freeze\((\{[^\n]*\})\);</script>\n",
    re.MULTILINE,
)


def file_hash(data):
    return hashlib.sha256(data).hexdigest()


def content_hash(name, data):
    if PurePosixPath(name).suffix.lower() not in TEXT_EXTENSIONS:
        return file_hash(data)
    content = data.decode("utf-8").replace("\r\n", "\n")
    if name == "index.html":
        matches = list(BOOTSTRAP_LINE.finditer(content))
        if len(matches) != 1:
            raise ValueError("Expected one generated native runtime bootstrap")
        config = json.loads(matches[0].group(1))
        if not isinstance(config, dict) or not {"publicUrl", "apiBaseUrl", "storage"} <= config.keys():
            raise ValueError("Unexpected native runtime bootstrap structure")
        content = BOOTSTRAP_LINE.sub("", content, count=1)
    return file_hash(content.encode("utf-8"))


def asset_hashes(entries):
    result = {}
    for name, data in entries:
        segments = name.split("/")
        if not name or "\\" in name or any(part in ("", ".", "..") for part in segments) or name in result:
            raise ValueError(f"Invalid or repeated package asset path: {name}")
        result[name] = {"raw": file_hash(data), "content": content_hash(name, data)}
    if "index.html" not in result:
        raise ValueError("Package web assets are missing index.html")
    return result


def archive_hashes(path, ios=False):
    with ZipFile(path) as package:
        def web_entries():
            ios_app = None
            for entry in package.infolist():
                if entry.is_dir():
                    continue
                if ios:
                    match = IOS_ENTRY.fullmatch(entry.filename)
                    if not match:
                        continue
                    app_name, name = match.groups()
                    if ios_app is not None and ios_app != app_name:
                        raise ValueError("IPA contains web assets from more than one app")
                    ios_app = app_name
                else:
                    if not entry.filename.startswith(ANDROID_PREFIX):
                        continue
                    name = entry.filename[len(ANDROID_PREFIX):]
                if stat.S_ISLNK(entry.external_attr >> 16):
                    raise ValueError(f"Package contains an asset symlink: {name}")
                yield name, package.read(entry)

        return asset_hashes(web_entries())


def directory_hashes(root):
    def web_entries():
        for path in root.rglob("*"):
            if path.is_symlink():
                raise ValueError(f"Prepared assets include a symlink: {path.name}")
            if path.is_file():
                yield path.relative_to(root).as_posix(), path.read_bytes()

    return asset_hashes(web_entries())


def compare(android, ios):
    if android.keys() != ios.keys():
        raise ValueError(f"Asset inventories differ: Android-only {sorted(android.keys() - ios.keys())}; "
                         f"iOS-only {sorted(ios.keys() - android.keys())}")
    different = sorted(name for name in android if android[name]["content"] != ios[name]["content"])
    if different:
        raise ValueError(f"Application asset content differs: {', '.join(different)}")
    return {
        "matching_app_assets": len(android),
        "raw_differences": sorted(name for name in android if android[name]["raw"] != ios[name]["raw"]),
        "compared_content": "All web assets, with LF text and the platform-generated runtime bootstrap excluded from index.html",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("aab", type=Path)
    ios = parser.add_mutually_exclusive_group(required=True)
    ios.add_argument("--ipa", type=Path)
    ios.add_argument("--prepared-ios", type=Path)
    args = parser.parse_args()
    right = archive_hashes(args.ipa, ios=True) if args.ipa else directory_hashes(args.prepared_ios)
    receipt = compare(archive_hashes(args.aab), right)
    receipt["ios_input"] = "ipa" if args.ipa else "prepared_assets"
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
