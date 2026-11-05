"""Fail-closed preparation of one frozen historical Native diagnostic; no build/download."""
import hashlib
import io
import json
import pathlib
import platform
import re
import subprocess
import sys
import shutil
import stat
import xml.etree.ElementTree as ET
import zipfile

SOURCE = 'abcbac91e97230e4737e80c4ea3c2206360e855f'
TREE = '76e2319de17a875db5f5b1e2b54c2b63659644b1'
TOOLS = '3b0e49be8bf1fb64cdc54950665d9cb4984f7c7f'
ARCHIVE_SHA256 = 'bba193b4fe17b6daa65ad57363facf39e58d5816e75d8ebb2e77eb75080e7572'
ARCHIVE_BYTES = 133871974
APK_SHA256 = '010c735cc3ab7dd08bded7da51bc566ad9f4665894310d21d7a68bb02ad3bc3b'
APK_PATH = 'android/app/build/outputs/apk/debug/app-debug.apk'
NATIVE = 'artifacts/android-native-isolated/'
SDK_FILES = {
    'emulator/source.properties': 'f7562ee75ef359fc20b64727a0977c6306c6bac2dab60c8d7ced7c9e372a7cc7',
    'emulator/lib/advancedFeatures.ini': '0f4532724ad5d666139607ab64bfb3eb42af140343ffb69c97afe72cb686d5f8',
    'system-images/android-36.1/google_apis_playstore/x86_64/source.properties': 'fb476989442a827bf45fe141abe7fa8a002efeab6e7f15f6bed78f0484a211aa',
    'system-images/android-36.1/google_apis_playstore/x86_64/advancedFeatures.ini': '6fc0aa05761982d23c9084b78fda14f4f6b49dfd176e3782686bba750c806316',
}
EMULATOR_URL = 'https://edgedl.me.gvt1.com/edgedl/android/repository/emulator-linux_x64-14472402.zip'
EMULATOR_BYTES = 320951246
EMULATOR_SHA256 = 'c8ab9ffbc4c2d11c02e06e81a9d9f81970177dc5ab599e3a30eb08a4a5496a67'
EMULATOR_ENTRIES = 395
EMULATOR_FILES = {
    'emulator/source.properties': '29bd3ff3cad33cd40ae43b89ac53bb7728037ab3bf4d69e27a0defd8082ce540',
    'emulator/lib/advancedFeatures.ini': 'e1a4a69cb5829f9aa5f9e9fcff5882a754cfb8bf6a446fb9ceeb81e3d0b3487e',
}
EXECUTABLES = ('emulator/emulator', 'emulator/mksdcard', 'emulator/qemu/linux-x86_64/qemu-system-x86_64')


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
    require(len(assets) == 283 and sum(row.get('font') is True for row in assets) == 13, 'Original asset/font inventory differs')
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
    receipt = {'sourceCommit': SOURCE, 'sourceTree': TREE, 'qaToolsCommit': TOOLS, 'originalRunId': 41888169747, 'originalArtifactId': 13354600815, 'archiveSha256': ARCHIVE_SHA256, 'apkSha256': APK_SHA256, 'assetCount': 283, 'fontCount': 13, 'originalApkRebuilt': False, 'diagnosticOnly': True, 'nativeAcceptance': False, 'anrFixed': False}
    (root / NATIVE / 'historical-apk-provenance.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    return receipt


def properties(text):
    result = {}
    for line in text.splitlines():
        if '=' in line and not line.lstrip().startswith(('#', ';')):
            key, value = [part.strip() for part in line.split('=', 1)]
            require(key not in result, 'Ambiguous property: ' + key)
            result[key] = value
    return result


def verify_sdk(sdk, os_release=pathlib.Path('/etc/os-release'), *, replacement=False):
    require(platform.system() == 'Linux' and platform.machine() == 'x86_64', 'Require Linux x86_64 hosted baseline')
    release = properties(os_release.read_text())
    require(release.get('ID', '').strip('"') == 'ubuntu' and release.get('VERSION_ID', '').strip('"') == '24.04', 'Require Ubuntu24.04 baseline')
    observed = {}
    expected_files = {**SDK_FILES, **(EMULATOR_FILES if replacement else {})}
    for name, expected in expected_files.items():
        path = sdk / name
        digest = file_sha(path)
        require(digest == expected, 'Historical SDK file SHA256 differs: ' + name)
        observed[name] = {'sha256': digest}
    host = properties((sdk / 'emulator/source.properties').read_text())
    guest = properties((sdk / 'system-images/android-36.1/google_apis_playstore/x86_64/source.properties').read_text())
    revision = '36.3.10' if replacement else '37.2.13'
    require(host.get('Pkg.Revision') == revision, 'Require emulator' + revision + '; no latest-version substitution')
    if replacement:
        require(host.get('Pkg.BuildId') == '14472402' and host.get('Pkg.Path') == 'emulator', 'Require official emulator build14472402')
    require(guest.get('Pkg.Revision') == '4' and guest.get('AndroidVersion.ApiLevel') == '36.1' and guest.get('SystemImage.Abi') == 'x86_64' and guest.get('SystemImage.TagId') == 'google_apis_playstore', 'Require exact Android36.1GooglePlay revision4 image')
    return {'host': 'ubuntu-24.04', 'architecture': 'x86_64', 'emulator': revision, 'imageRevision': '4', 'files': observed, 'matched': True, 'nativeAcceptance': False}


def verify_emulator_archive(path):
    require(path.stat().st_size == EMULATOR_BYTES, 'Official emulator ZIP byte length differs')
    require(file_sha(path) == EMULATOR_SHA256, 'Official emulator ZIP SHA256 differs')
    with zipfile.ZipFile(path) as archive:
        names = unique_entries(archive)
        require(len(names) == EMULATOR_ENTRIES, 'Official emulator ZIP entry count differs')
        require('emulator/package.xml' not in names, 'Unexpected package.xml in official ZIP')
        for entry in archive.infolist():
            name = pathlib.PurePosixPath(entry.filename)
            mode = entry.external_attr >> 16
            require(not name.is_absolute() and name.parts and name.parts[0] == 'emulator'
                    and '..' not in name.parts and '\\' not in entry.filename and ':' not in entry.filename,
                    'Emulator ZIP path escapes package')
            require(stat.S_IFMT(mode) in (0, stat.S_IFREG, stat.S_IFDIR) and not stat.S_ISLNK(mode), 'Emulator ZIP special file forbidden')
        for name, expected in EMULATOR_FILES.items():
            require(sha(archive.read(name)) == expected, 'Official emulator member SHA256 differs: ' + name)
        host = properties(archive.read('emulator/source.properties').decode('utf-8'))
        require(host.get('Pkg.Revision') == '36.3.10' and host.get('Pkg.BuildId') == '14472402' and host.get('Pkg.Path') == 'emulator', 'Official emulator revision/build differs')
        for name in EXECUTABLES:
            entry = archive.getinfo(name)
            require(not entry.is_dir() and entry.external_attr >> 16 & 0o111, 'Emulator executable mode missing: ' + name)
    return {'url': EMULATOR_URL, 'sha256': EMULATOR_SHA256, 'bytes': EMULATOR_BYTES, 'entries': EMULATOR_ENTRIES, 'revision': '36.3.10', 'buildId': '14472402', 'verified': True, 'nativeAcceptance': False}


def package_revision(text):
    document = ET.fromstring(text)
    packages = [node for node in document.iter() if node.tag.split('}')[-1] == 'localPackage']
    require(len(packages) == 1 and packages[0].get('path') == 'emulator', 'Expected one emulator localPackage')
    revisions = [node for node in packages[0] if node.tag.split('}')[-1] == 'revision']
    require(len(revisions) == 1, 'Expected one package revision')
    parts = {node.tag.split('}')[-1]: node.text for node in revisions[0]}
    require(set(parts) == {'major', 'minor', 'micro'} and len(revisions[0]) == 3, 'Unexpected package revision structure')
    return '.'.join(parts[key] or '' for key in ('major', 'minor', 'micro'))


def replacement_package_xml(original):
    text = original.decode('utf-8')
    require(package_revision(text) == '37.2.13', 'Original package.xml revision differs')
    blocks = list(re.finditer(r'<(?P<prefix>[\w.-]+:)?revision\b[^>]*>[\s\S]*?</(?P=prefix)revision\s*>|<revision\b[^>]*>[\s\S]*?</revision\s*>', text))
    require(len(blocks) == 1, 'Ambiguous package.xml revision block')
    block = blocks[0]
    updated = block.group()
    for key, value in [('major', '36'), ('minor', '3'), ('micro', '10')]:
        updated, count = re.subn(r'(<(?:[\w.-]+:)?' + key + r'\b[^>]*>)(\s*)\d+(\s*)(</(?:[\w.-]+:)?' + key + r'\s*>)', lambda match: match[1] + match[2] + value + match[3] + match[4], updated)
        require(count == 1, 'Ambiguous package.xml revision component')
    # Keep namespace declarations and xsi:type values byte-for-byte outside this block.
    result = text[:block.start()] + updated + text[block.end():]
    require(package_revision(result) == '36.3.10', 'Replacement package.xml validation failed')
    return result.encode('utf-8')


def install_emulator(sdk, archive_path, temporary, os_release=pathlib.Path('/etc/os-release')):
    baseline = verify_sdk(sdk, os_release)
    official = verify_emulator_archive(archive_path)
    root, owned = sdk.resolve(strict=True), temporary.resolve(strict=True)
    require(not root.is_relative_to(owned) and not owned.is_relative_to(root), 'SDK and temporary roots must be separate')
    emulator = root / 'emulator'
    require(not emulator.is_symlink() and emulator.resolve(strict=True).parent == root, 'Emulator path escapes SDK')
    staging, backup = owned / 'android-abcb-emulator-36310-stage', owned / 'android-abcb-emulator-37213-original'
    require(not staging.exists() and not staging.is_symlink() and not backup.exists() and not backup.is_symlink(), 'Refuse existing staging/backup path')
    require(staging.resolve().parent == owned and backup.resolve().parent == owned, 'Owned temporary paths escape root')
    original_xml = (emulator / 'package.xml').read_bytes()
    new_xml = replacement_package_xml(original_xml)
    staging.mkdir()
    with zipfile.ZipFile(archive_path) as archive:
        for entry in archive.infolist():
            target = staging / entry.filename
            require(target.resolve().is_relative_to(staging), 'Extraction escapes owned staging')
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(entry) as source, target.open('xb') as destination:
                    shutil.copyfileobj(source, destination)
                target.chmod(entry.external_attr >> 16 & 0o777)
    (staging / 'emulator/package.xml').write_bytes(new_xml)
    # The backup lives outside the SDK so SDK package scanning cannot select it.
    shutil.move(str(emulator), str(backup))
    try:
        shutil.move(str(staging / 'emulator'), str(emulator))
        replacement = verify_sdk(root, os_release, replacement=True)
        require(package_revision((emulator / 'package.xml').read_text()) == '36.3.10', 'Installed package.xml revision differs')
    except Exception:
        # Retain both trees, with the original restored at its original SDK path.
        if emulator.exists():
            shutil.move(str(emulator), str(staging / 'rejected-emulator'))
        shutil.move(str(backup), str(emulator))
        raise
    return {'baseline': baseline, 'replacement': replacement, 'officialArchive': official, 'originalPackageXmlSha256': sha(original_xml), 'replacementPackageXmlSha256': sha(new_xml), 'originalEmulatorBackup': str(backup), 'onlyEmulatorPackageReplaced': True, 'diagnosticOnly': True, 'nativeAcceptance': False, 'anrFixed': False}


def main():
    require(len(sys.argv) >= 3, 'Require an explicit operation and paths')
    if sys.argv[1] in ('verify-sdk', 'verify-baseline-sdk'):
        require(len(sys.argv) == 3, 'Require one explicit SDK root')
        receipt = verify_sdk(pathlib.Path(sys.argv[2]), replacement=sys.argv[1] == 'verify-sdk')
    elif sys.argv[1] == 'verify-emulator-archive':
        require(len(sys.argv) == 3, 'Require one explicit emulator ZIP')
        receipt = verify_emulator_archive(pathlib.Path(sys.argv[2]))
    elif sys.argv[1] == 'install-emulator':
        require(len(sys.argv) == 5, 'Require SDK, official ZIP and owned temporary root')
        receipt = install_emulator(*map(pathlib.Path, sys.argv[2:]))
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
