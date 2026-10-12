import datetime
import hashlib
import json
import os
import pathlib
import plistlib
import re
import subprocess
import sys
import tempfile
import zipfile

SOURCE = os.environ.get('SOURCE_SHA', '')
TREE = '4a208e596cbaf0576cccd7f67fc99a665287836d'
if SOURCE != 'bf254b5235deb706234b00362e6eaea78e129e98':
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

def validate_config(data):
    config = json.loads(data)
    require(config.get('appId') == BUNDLE and config.get('webDir') == 'www', 'Unexpected Capacitor identity')
    require('url' not in config.get('server', {}), 'Remote server.url is forbidden in this artifact')
    require(config.get('ios', {}).get('contentInset') == 'automatic', 'Unexpected iOS content inset')
    require(config.get('ios', {}).get('preferredContentMode') == 'mobile', 'Unexpected iOS content mode')

def snapshot(root):
    web = file_map(root / 'www')
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
    return {'sourceCommit': SOURCE, 'sourceTree': TREE, 'pwaRelease': '514', 'www': web, 'iosPublic': copied, 'nativeConfigs': configs, 'privacyManifest': plistlib.loads((root / 'ios/App/App/PrivacyInfo.xcprivacy').read_bytes())}

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
    require(info.get('CFBundleShortVersionString') == '4.58' and info.get('CFBundleVersion') == '193', 'Wrong IPA version/build')
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

def verify(root, expected):
    require(snapshot(root) == expected, 'Prepared web assets changed after snapshot')
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
        certificate_prefix = str(extracted / 'signing-cert-')
        subprocess.run(['/usr/bin/codesign', '-d', '--extract-certificates', certificate_prefix, str(app_path)], check=True, capture_output=True)
        require(digest(pathlib.Path(certificate_prefix + '0').read_bytes()) == CERT_SHA256, 'Actual signing certificate differs from the reviewed distribution certificate')
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
    proof = {'sourceCommit': SOURCE, 'sourceTree': before['sourceTree'], 'pwaRelease': '514', 'version': '4.58', 'build': '193', 'ipaSha256': sha, 'wwwFileCount': len(expected['www']), 'ipaWebFileCount': len(expected['iosPublic']), 'everyWwwAssetMatches': True, 'noUnexpectedWebAssets': True, 'noRemoteServerUrl': True, 'signatureVerified': True, 'signingCertificateSha256': CERT_SHA256, 'privacyManifestSemanticallyMatches': True, 'profile': profile_proof, 'ci': after['ci'], 'appleBuildReadback': after['apple'], 'physicalDeviceAcceptance': False, 'appleUploadPerformed': False, 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (root / 'build/ios/artifact-verification.json').write_text(json.dumps(proof, indent=2) + '\n')
    manifest.update(proof)
    (root / 'build/ios/release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Signed artifact identity, signature, profile and all web assets verified; no Apple upload.')

if __name__ == '__main__':
    root = pathlib.Path.cwd()
    target = root / 'build/ios/web-assets.json'
    if sys.argv[1] == 'snapshot':
        target.write_text(json.dumps(snapshot(root), indent=2) + '\n')
        print('Complete web and native configuration snapshot saved.')
    elif sys.argv[1] == 'verify':
        verify(root, json.loads(target.read_text()))
    else:
        raise ValueError('Expected snapshot or verify')
