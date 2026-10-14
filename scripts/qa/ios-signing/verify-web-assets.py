import datetime
import hashlib
import json
import os
import pathlib
import plistlib
import re
import subprocess
import sys
import tarfile
import tempfile
import zipfile

SOURCE = os.environ.get('SOURCE_SHA', '')
TREE = 'f0b49a2a44564f4d8fe1267862f5f4c3ad239f5a'
if SOURCE != 'bb387a4cddac22dc236224a1b22509b093bbd943':
    raise ValueError('Expected the coordinator frozen release source')
TEAM = 'MA9S4L7WKS'
BUNDLE = 'com.sogrimhashbon.app'
CERT_SHA256 = 'ae0e5a0a889d2852b178124f02377084e4cb95905f7a62a6ed3787988b7828b8'

def require(condition, message):
    if not condition:
        raise ValueError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def file_map(directory):
    require(directory.is_dir(), 'Expected asset directory is missing')
    result = {}
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink(), 'Asset symlinks are not allowed')
        if path.is_file():
            result[path.relative_to(directory).as_posix()] = digest(path.read_bytes())
    require(len(result) > 0, 'Empty web asset directory')
    return result

def compare_canonical_www(prepared, canonical):
    require(prepared == canonical, 'WWW differs from independently built canonical Git bytes')

def canonical_archive_command(source, git_binary='git'):
    # git archive otherwise honors core.autocrlf on Windows. Verify original
    # blobs, never repair or normalize the exported bytes after the fact.
    return [git_binary, '-c', 'core.autocrlf=false', '-c', 'core.eol=lf',
            'archive', '--format=tar', source]

def extract_git_archive(stream, destination, expected):
    seen = set()
    with tarfile.open(fileobj=stream, mode='r|') as archive:
        for entry in archive:
            path = pathlib.PurePosixPath(entry.name)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in entry.name,
                    'Unsafe canonical Git archive path')
            if entry.isdir():
                continue
            require(entry.isfile() and entry.name in expected and entry.name not in seen,
                    'Unexpected, duplicate or nonregular canonical Git file')
            data = archive.extractfile(entry).read()
            blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            require(blob == expected[entry.name], 'Canonical archive bytes differ from Git blob')
            target = destination / entry.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            seen.add(entry.name)
    require(seen == set(expected), 'Canonical Git archive is incomplete')

def canonical_git_www(root):
    def git(*args):
        return subprocess.run(['git', *args], cwd=root, check=True, capture_output=True).stdout
    require(git('rev-parse', 'HEAD').decode().strip() == SOURCE, 'Canonical audit needs exact source HEAD')
    require(git('rev-parse', 'HEAD^{tree}').decode().strip() == TREE, 'Canonical audit needs exact Git tree')
    entries = {}
    for row in git('ls-tree', '-r', '-z', SOURCE).split(b'\0'):
        if not row:
            continue
        header, path = row.split(b'\t', 1)
        mode, kind, blob = header.decode().split(' ')
        require(mode in ('100644', '100755') and kind == 'blob', 'Nonregular canonical Git input')
        entries[path.decode('utf-8')] = blob
    require(len(entries) > 500, 'Incomplete canonical Git input tree')
    require(not any(name.startswith(('www/', 'node_modules/')) for name in entries),
            'Generated assets or dependencies must not replace canonical inputs')
    with tempfile.TemporaryDirectory(prefix='sogrim-canonical-www-') as directory:
        reference = pathlib.Path(directory)
        with subprocess.Popen(canonical_archive_command(SOURCE), cwd=root,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE) as process:
            try:
                extract_git_archive(process.stdout, reference, entries)
            except Exception:
                if process.poll() is None:
                    process.kill()
                process.communicate()
                raise
            require(process.wait() == 0, 'Cannot export canonical Git source')
        dependencies = root / 'node_modules'
        require(dependencies.is_dir(), 'Locked npm ci dependencies are required')
        (reference / 'node_modules').symlink_to(dependencies, target_is_directory=True)
        subprocess.run(['node', 'scripts/build-native-web.mjs'], cwd=reference,
                       check=True, capture_output=True)
        canonical = file_map(reference / 'www')
        require(len(canonical) >= 200, 'Incomplete canonical WWW build')
        require({'index.html', 'assets/native-layers.css', 'assets/native-style-loader.mjs',
                 *('assets/native-' + name + '.mjs' for name in ('prelude', 'auth', 'core', 'account', 'experience'))}
                .issubset(canonical), 'Canonical generated entry points missing')
        compare_canonical_www(file_map(root / 'www'), canonical)
    return {'sourceCommit': SOURCE, 'sourceTree': TREE, 'gitInputCount': len(entries),
            'allArchiveBytesMatchGitBlobs': True, 'lockedDependenciesSharedAfterNpmCi': True,
            'independentCanonicalBuild': True, 'www': canonical}

def validate_config(data):
    config = json.loads(data)
    require(config.get('appId') == BUNDLE and config.get('webDir') == 'www', 'Unexpected Capacitor identity')
    require('url' not in config.get('server', {}), 'Remote server.url is forbidden in this artifact')
    require(config.get('ios', {}).get('contentInset') == 'automatic', 'Unexpected iOS content inset')
    require(config.get('ios', {}).get('preferredContentMode') == 'mobile', 'Unexpected iOS content mode')

def snapshot(root, canonical=None):
    web = file_map(root / 'www')
    if canonical is not None:
        require(canonical.get('sourceCommit') == SOURCE and canonical.get('sourceTree') == TREE,
                'Canonical proof belongs to another source')
        require(canonical.get('independentCanonicalBuild') is True and
                canonical.get('allArchiveBytesMatchGitBlobs') is True and
                canonical.get('gitInputCount', 0) > 500, 'Canonical Git byte proof missing')
        compare_canonical_www(web, canonical.get('www'))
    copied = file_map(root / 'ios/App/App/public')
    require(set(copied) == set(web) | {'cordova.js', 'cordova_plugins.js'}, 'Unexpected files in copied iOS web assets')
    for name, sha in web.items():
        require(copied[name] == sha, 'Capacitor copied a different web asset: ' + name)
    for name in ('cordova.js', 'cordova_plugins.js'):
        require(copied[name] == digest(b''), 'Unexpected Cordova plugin content')
    configs = {}
    for name in ('capacitor.config.json', 'config.xml', 'PrivacyInfo.xcprivacy'):
        data = (root / 'ios/App/App' / name).read_bytes()
        configs[name] = digest(data)
        if name == 'capacitor.config.json':
            validate_config(data)
    result = {'sourceCommit': SOURCE, 'sourceTree': TREE, 'pwaRelease': '516', 'www': web, 'iosPublic': copied, 'nativeConfigs': configs, 'privacyManifest': plistlib.loads((root / 'ios/App/App/PrivacyInfo.xcprivacy').read_bytes())}
    if canonical is not None:
        result['canonicalGit'] = canonical
    return result

def inspect_zip(archive, expected):
    entries = archive.infolist()
    names = [entry.filename for entry in entries]
    require(len(names) == len(set(names)), 'Duplicate IPA entries are forbidden')
    for name in names:
        path = pathlib.PurePosixPath(name)
        require(not path.is_absolute() and '..' not in path.parts and '\\' not in name, 'Unsafe IPA entry')
    info_paths = [name for name in names if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist', name)]
    require(len(info_paths) == 1, 'Expected exactly one IPA application')
    app = info_paths[0][:-len('Info.plist')]
    info = plistlib.loads(archive.read(info_paths[0]))
    require(info.get('CFBundleIdentifier') == BUNDLE, 'Wrong IPA bundle')
    require(info.get('CFBundleShortVersionString') == '4.58' and info.get('CFBundleVersion') == '194', 'Wrong IPA version/build')
    prefix = app + 'public/'
    public = {name[len(prefix):]: digest(archive.read(name)) for name in names if name.startswith(prefix) and not name.endswith('/')}
    require(public == expected['iosPublic'], 'IPA web assets do not exactly match the newly built source')
    for name, sha in expected['nativeConfigs'].items():
        data = archive.read(app + name)
        if name == 'PrivacyInfo.xcprivacy':
            require(plistlib.loads(data) == expected['privacyManifest'], 'IPA privacy declaration differs from prepared declaration')
        else:
            require(digest(data) == sha, 'IPA native configuration differs from prepared configuration')
        if name == 'capacitor.config.json':
            validate_config(data)
    return app

def validate_profile(profile, signed):
    now = datetime.datetime.now(datetime.timezone.utc)
    expiration = profile.get('ExpirationDate')
    creation = profile.get('CreationDate')
    require(isinstance(expiration, datetime.datetime) and isinstance(creation, datetime.datetime), 'Profile dates missing')
    require(creation.replace(tzinfo=datetime.timezone.utc) <= now < expiration.replace(tzinfo=datetime.timezone.utc), 'Profile expired or not yet valid')
    require(profile.get('TeamIdentifier') == [TEAM], 'Wrong provisioning team')
    require(profile.get('Name') == 'Sogrim Hashbon App Store 2026', 'Wrong provisioning profile')
    require(not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'Expected App Store distribution profile')
    require(any(digest(cert) == CERT_SHA256 for cert in profile.get('DeveloperCertificates', [])), 'Known distribution certificate missing from profile')
    for entitlements in (profile.get('Entitlements', {}), signed):
        require(entitlements.get('application-identifier') == TEAM + '.' + BUNDLE, 'Wrong signed application identifier')
        require(entitlements.get('com.apple.developer.team-identifier') == TEAM, 'Wrong signed team entitlement')
        require(entitlements.get('get-task-allow') is False, 'Debug entitlement is forbidden')
        require(entitlements.get('com.apple.developer.applesignin') == ['Default'], 'Apple sign-in entitlement is missing')
    require(set(['applinks:sogrim-hesbon-app.vercel.app', 'webcredentials:sogrim-hesbon-app.vercel.app']).issubset(signed.get('com.apple.developer.associated-domains', [])), 'Associated Domains missing')
    return {'profileValidAtVerification': True, 'profileExpiresAt': expiration.replace(tzinfo=datetime.timezone.utc).isoformat(), 'knownCertificateIncluded': True, 'debugEntitlement': False, 'appleSignIn': ['Default']}

def verify_signing_certificate(app_path, directory):
    certificate_prefix = str(pathlib.Path(directory) / 'signing-cert-')
    subprocess.run(['/usr/bin/codesign', '-d', '--extract-certificates=' + certificate_prefix, str(app_path)], check=True, capture_output=True)
    certificate_sha = digest(pathlib.Path(certificate_prefix + '0').read_bytes())
    require(certificate_sha == CERT_SHA256, 'Actual signing certificate differs from the reviewed distribution certificate')
    return certificate_sha

def verify(root, expected):
    require('canonicalGit' in expected, 'Independent canonical Git proof is required before signing acceptance')
    require(snapshot(root, expected['canonicalGit']) == expected, 'Prepared web assets changed after snapshot')
    ipa = root / 'build/ios/SogrimHashbon.ipa'
    manifest = json.loads((root / 'build/ios/release-manifest.json').read_text())
    sha = digest(ipa.read_bytes())
    require(manifest.get('sha256', '').lower() == sha, 'Signed IPA changed after signature verification')
    with zipfile.ZipFile(ipa) as archive:
        app = inspect_zip(archive, expected)
    require(sys.platform == 'darwin', 'Real codesign and provisioning checks require macOS')
    with tempfile.TemporaryDirectory(prefix='sogrim-458-artifact-') as directory:
        extracted = pathlib.Path(directory)
        subprocess.run(['/usr/bin/ditto', '-x', '-k', str(ipa), str(extracted)], check=True, capture_output=True)
        app_path = extracted / app
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app_path)], check=True, capture_output=True)
        verify_signing_certificate(app_path, extracted)
        signed_result = subprocess.run(['/usr/bin/codesign', '-d', '--entitlements', ':-', str(app_path)], check=True, capture_output=True)
        signed = plistlib.loads(signed_result.stdout)
        profile_result = subprocess.run(['/usr/bin/security', 'cms', '-D', '-i', str(app_path / 'embedded.mobileprovision')], check=True, capture_output=True)
        profile = plistlib.loads(profile_result.stdout)
        profile_proof = validate_profile(profile, signed)
    before = json.loads((root / 'build/ios/source-before-build.json').read_text())
    after = json.loads((root / 'build/ios/source-after-export.json').read_text())
    require(before['sourceCommit'] == after['sourceCommit'] == SOURCE, 'Source proof mismatch')
    require(before['sourceTree'] == after['sourceTree'] == TREE, 'Source tree proof mismatch')
    require(before['packageSha256'] == after['packageSha256'] and before['packageLockSha256'] == after['packageLockSha256'], 'Package declarations changed during build')
    proof = {'sourceCommit': SOURCE, 'sourceTree': before['sourceTree'], 'pwaRelease': '516', 'version': '4.58', 'build': '194', 'ipaSha256': sha, 'wwwFileCount': len(expected['www']), 'ipaWebFileCount': len(expected['iosPublic']), 'everyWwwAssetMatches': True, 'everyWwwAssetMatchesCanonicalGitBuild': True, 'canonicalGitInputCount': expected['canonicalGit']['gitInputCount'], 'noUnexpectedWebAssets': True, 'noRemoteServerUrl': True, 'signatureVerified': True, 'signingCertificateSha256': CERT_SHA256, 'privacyManifestSemanticallyMatches': True, 'profile': profile_proof, 'ci': after['ci'], 'appleBuildReadback': after['apple'], 'physicalDeviceAcceptance': False, 'appleUploadPerformed': False, 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (root / 'build/ios/artifact-verification.json').write_text(json.dumps(proof, indent=2) + '\n')
    manifest.update(proof)
    (root / 'build/ios/release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Signed artifact identity, signature, profile and all web assets verified; no Apple upload.')

if __name__ == '__main__':
    root = pathlib.Path.cwd()
    target = root / 'build/ios/web-assets.json'
    if sys.argv[1] == 'snapshot':
        target.write_text(json.dumps(snapshot(root, canonical_git_www(root)), indent=2) + '\n')
        print('Complete web and native configuration snapshot saved.')
    elif sys.argv[1] == 'verify':
        verify(root, json.loads(target.read_text()))
    else:
        raise ValueError('Expected snapshot or verify')
