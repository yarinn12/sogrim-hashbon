"""Fail-closed preparation of one frozen historical Native diagnostic; no build/download."""
import hashlib
import io
import json
import pathlib
import platform
import subprocess
import sys
import time
import zipfile

SOURCE = '2d4a973a197a2228fcd134f01d6763f500fd63bb'
TREE = '6c8c8afe3315d3f86f96c4805aae23894a7aa210'
TOOLS = 'd0c7bd1040993d15e382e48865e21c72ca8b3236'
ARCHIVE_SHA256 = '295824d624b928617b50bf7988bf258f7161cbdc30a78abc2ec266cfc1080f18'
ARCHIVE_BYTES = 129085539
APK_SHA256 = '42234fe6dfba53c22c36be34eca3c6f28b3a38bc365827a93386ca17df5095cb'
APK_PATH = 'android/app/build/outputs/apk/debug/app-debug.apk'
NATIVE = 'artifacts/android-native-isolated/'
SDK_FILES = {
    'emulator/source.properties': 'f7562ee75ef359fc20b64727a0977c6306c6bac2dab60c8d7ced7c9e372a7cc7',
    'emulator/lib/advancedFeatures.ini': '0f4532724ad5d666139607ab64bfb3eb42af140343ffb69c97afe72cb686d5f8',
    'system-images/android-36.1/google_apis_playstore/x86_64/source.properties': 'fb476989442a827bf45fe141abe7fa8a002efeab6e7f15f6bed78f0484a211aa',
    'system-images/android-36.1/google_apis_playstore/x86_64/advancedFeatures.ini': '6fc0aa05761982d23c9084b78fda14f4f6b49dfd176e3782686bba750c806316',
}


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def unique_entries(archive):
    names = archive.namelist()
    require(len(names) == len(set(names)), 'Duplicate ZIP entries')
    return names


def read_original_archive(path):
    require(path.stat().st_size == ARCHIVE_BYTES, 'Original artifact byte length differs')
    require(file_sha(path) == ARCHIVE_SHA256, 'Original artifact SHA256 differs')
    with zipfile.ZipFile(path) as archive:
        unique_entries(archive)
        frozen = {name: archive.read(name) for name in [APK_PATH, NATIVE + 'fixture-provenance.json', NATIVE + 'apk-assets.json', NATIVE + 'qa-tools-source.txt']}
    require(sha(frozen[APK_PATH]) == APK_SHA256, 'Original APK SHA256 differs')
    require(frozen[NATIVE + 'qa-tools-source.txt'].decode().strip() == TOOLS, 'Original QA tools differ')
    fixture = json.loads(frozen[NATIVE + 'fixture-provenance.json'])
    audit = json.loads(frozen[NATIVE + 'apk-assets.json'])
    for metadata in [fixture, audit]:
        require(metadata.get('sourceCommit') == SOURCE and metadata.get('sourceTree') == TREE, 'Original app source/tree differs')
        require(metadata.get('nativeDiagnosticAbsent') is True, 'Diagnostic Native probe is forbidden')
    require(fixture.get('bootstrapIsSynthetic') is True and fixture.get('privateEnvDisabled') is True, 'Original synthetic/private-env provenance required')
    require(audit.get('ready') is True and audit.get('apkSha256') == APK_SHA256 and audit.get('errors') == [], 'Original APK audit is not ready')
    assets = audit['assets']
    require(len(assets) == 284 and sum(row.get('font') is True for row in assets) == 13, 'Original asset/font inventory differs')
    names = [row['path'] for row in assets]
    require(len(names) == len(set(names)), 'Duplicate audit assets')
    for name in names:
        relative = pathlib.PurePosixPath(name)
        require(not relative.is_absolute() and '..' not in relative.parts and '\\' not in name, 'Invalid asset path')
    with zipfile.ZipFile(io.BytesIO(frozen[APK_PATH])) as apk:
        actual = {name[len('assets/public/'):] for name in unique_entries(apk) if name.startswith('assets/public/') and not name.endswith('/')}
        require(actual == set(names), 'Unlisted or missing APK public assets')
        for row in assets:
            data = apk.read('assets/public/' + row['path'])
            require(len(data) == row['length'] and sha(data) == row['sha256'], 'Original APK asset bytes differ: ' + row['path'])
    return frozen, audit


def prepare(archive, checkout):
    root = checkout.resolve(strict=True)
    head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    tree = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD^{tree}'], text=True).strip()
    require(head == SOURCE and tree == TREE, 'Historical checkout identity differs')
    plugin = root / 'android/app/src/main/java/com/sogrimhashbon/app/SogrimCapabilitiesPlugin.java'
    require('getQaWebViewTypography' not in plugin.read_text(), 'Diagnostic Native probe in checkout')
    frozen, audit = read_original_archive(archive)
    with zipfile.ZipFile(io.BytesIO(frozen[APK_PATH])) as apk:
        for row in audit['assets']:
            if row['font']:
                source = (root / row['path']).resolve()
                require(source.is_relative_to(root) and source.is_file() and source.read_bytes() == apk.read('assets/public/' + row['path']), 'Bundled font differs from original checkout: ' + row['path'])
    destinations = {}
    for name, data in frozen.items():
        target = root / name
        require(target.resolve().is_relative_to(root), 'Frozen destination escapes checkout')
        require(not target.exists() or target.is_file() and target.read_bytes() == data, 'Refuse overwrite of different prepared bytes: ' + name)
        destinations[target] = data
    for target, data in destinations.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(data)
    receipt = {'sourceCommit': SOURCE, 'sourceTree': TREE, 'qaToolsCommit': TOOLS, 'originalRunId': 42274817530, 'originalArtifactId': 13534285250, 'archiveSha256': ARCHIVE_SHA256, 'apkSha256': APK_SHA256, 'assetCount': 284, 'fontCount': 13, 'originalApkRebuilt': False, 'diagnosticOnly': True, 'nativeAcceptance': False, 'anrFixed': False}
    (root / NATIVE / 'transport-original-apk-provenance.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    return receipt


def properties(text):
    result = {}
    for line in text.splitlines():
        if '=' in line and not line.lstrip().startswith(('#', ';')):
            key, value = [part.strip() for part in line.split('=', 1)]
            require(key not in result, 'Ambiguous property: ' + key)
            result[key] = value
    return result


def verify_tracked_files(root, entries):
    records = []
    for row in entries.split(b'\0'):
        if not row:
            continue
        metadata, name = row.split(b'\t', 1)
        mode, kind, expected = metadata.decode().split(' ')
        require(mode in ['100644', '100755'] and kind == 'blob', 'Unsupported source file kind')
        relative = pathlib.PurePosixPath(name.decode('utf-8'))
        require(not relative.is_absolute() and '..' not in relative.parts, 'Source path escapes checkout')
        target = root / relative
        require(not target.is_symlink() and target.resolve().is_relative_to(root.resolve()), 'Redirected source file')
        data = target.read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        require(actual == expected, 'Raw original source bytes differ: ' + str(relative))
        records.append({'path': str(relative), 'sha256': sha(data)})
    return records


def verify_source(root):
    git = lambda *args: subprocess.check_output(['git', '-C', str(root), *args])
    require(git('rev-parse', 'HEAD').decode().strip() == SOURCE, 'Original checkout HEAD differs')
    require(git('rev-parse', 'HEAD^{tree}').decode().strip() == TREE, 'Original checkout tree differs')
    records = verify_tracked_files(root, git('ls-tree', '-rz', 'HEAD'))
    require(len(records) == 2037, 'Original raw source inventory differs')
    return {'source': SOURCE, 'tree': TREE, 'rawFiles': len(records), 'allRawBytesMatch': True, 'manifestSha256': sha(json.dumps(records, sort_keys=True).encode()), 'nativeAcceptance': False}


def verify_sdk(sdk, os_release=pathlib.Path('/etc/os-release')):
    require(platform.system() == 'Linux' and platform.machine() == 'x86_64', 'Require Linux x86_64 hosted baseline')
    release = properties(os_release.read_text())
    require(release.get('ID', '').strip('"') == 'ubuntu' and release.get('VERSION_ID', '').strip('"') == '24.04', 'Require Ubuntu24.04 baseline')
    observed = {}
    for name, expected in SDK_FILES.items():
        path = sdk / name
        digest = file_sha(path)
        require(digest == expected, 'Historical SDK file SHA256 differs: ' + name)
        observed[name] = {'sha256': digest}
    host = properties((sdk / 'emulator/source.properties').read_text())
    guest = properties((sdk / 'system-images/android-36.1/google_apis_playstore/x86_64/source.properties').read_text())
    require(host.get('Pkg.Revision') == '37.2.13', 'Require emulator37.2.13; no latest-version substitution')
    require(guest.get('Pkg.Revision') == '4' and guest.get('AndroidVersion.ApiLevel') == '36.1' and guest.get('SystemImage.Abi') == 'x86_64' and guest.get('SystemImage.TagId') == 'google_apis_playstore', 'Require exact Android36.1GooglePlay revision4 image')
    return {'host': 'ubuntu-24.04', 'architecture': 'x86_64', 'emulator': '37.2.13', 'imageRevision': '4', 'files': observed, 'matched': True, 'nativeAcceptance': False}


def fingerprint_file(sdk, path):
    root, resolved = sdk.resolve(strict=True), path.resolve(strict=True)
    require(resolved.is_relative_to(root / 'emulator') and resolved.is_file(), 'SDK binary escapes emulator root')
    before = resolved.stat()
    with resolved.open('rb') as source:
        require(source.read(4) == b'\x7fELF', 'Required SDK binary is not ELF: ' + str(path))
    digest = file_sha(resolved)
    after = resolved.stat()
    require((before.st_ino, before.st_size, before.st_mtime_ns) == (after.st_ino, after.st_size, after.st_mtime_ns), 'SDK binary changed during hashing')
    return {'path': path.relative_to(root).as_posix(), 'resolvedPath': resolved.relative_to(root).as_posix(), 'bytes': after.st_size, 'sha256': digest}


def fingerprint_sdk(sdk):
    started = time.monotonic()
    root = sdk.resolve(strict=True)
    required = [root / 'emulator/emulator', root / 'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless']
    files = [fingerprint_file(root, path) for path in required]
    emulator = root / 'emulator'
    libraries = emulator / 'lib64'
    require(libraries.is_dir() and not libraries.is_symlink(), 'Missing or redirected SDK lib64')
    pending, examined = [emulator], 0
    while pending:
        directory = pending.pop()
        for path in sorted(directory.iterdir()):
            examined += 1
            require(examined <= 4096, 'SDK library inventory bound exceeded')
            if path.is_dir():
                require(not path.is_symlink(), 'Refuse redirected SDK library directory')
                pending.append(path)
            elif path.is_file():
                require(path.resolve(strict=True).is_relative_to(root / 'emulator'), 'SDK library escapes emulator root')
                with path.open('rb') as source:
                    elf = source.read(4) == b'\x7fELF'
                if elf and path not in required:
                    files.append(fingerprint_file(root, path))
    require(len(files) > 2 and any(row['path'].startswith('emulator/lib64/') for row in files), 'No ELF SDK libraries found')
    files.sort(key=lambda row: row['path'])
    return {'coverage': 'emulator-elf-tree-v1', 'historicalBinaryComparison': False, 'files': files, 'totalBytesHashed': sum(row['bytes'] for row in files), 'durationMs': (time.monotonic() - started) * 1000, 'nativeAcceptance': False}


def main():
    require(len(sys.argv) >= 3, 'Require verify-sdk or prepare operation')
    if sys.argv[1] == 'verify-sdk':
        require(len(sys.argv) == 3, 'Require one explicit SDK root')
        receipt = verify_sdk(pathlib.Path(sys.argv[2]))
    elif sys.argv[1] == 'verify-source':
        require(len(sys.argv) == 3, 'Require exact original checkout')
        receipt = verify_source(pathlib.Path(sys.argv[2]))
    elif sys.argv[1] == 'fingerprint-sdk':
        require(len(sys.argv) == 3, 'Require one explicit SDK root')
        receipt = fingerprint_sdk(pathlib.Path(sys.argv[2]))
    else:
        require(sys.argv[1] == 'prepare' and len(sys.argv) == 4, 'Require explicit original archive and historical checkout')
        receipt = prepare(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]))
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ready': False, 'error': str(error), 'nativeAcceptance': False}), file=sys.stderr)
        sys.exit(1)
