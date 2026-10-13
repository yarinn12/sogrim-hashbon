import copy
import datetime
import io
import json
import pathlib
import plistlib
import tempfile
import unittest
import warnings
import zipfile
import importlib.util

spec = importlib.util.spec_from_file_location('assets', pathlib.Path(__file__).with_name('verify-web-assets.py'))
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)

class AssetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).parent)
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        config = {'appId': assets.BUNDLE, 'webDir': 'www', 'server': {'androidScheme': 'https'}, 'ios': {'contentInset': 'automatic', 'preferredContentMode': 'mobile'}}
        for name, data in {'index.html': b'<html>synthetic 515</html>', 'assets/styles.css': b'button{min-height:44px}'}.items():
            for directory in ('www', 'ios/App/App/public'):
                target = self.root / directory / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
        for name in ('cordova.js', 'cordova_plugins.js'):
            (self.root / 'ios/App/App/public' / name).write_bytes(b'')
        (self.root / 'ios/App/App/capacitor.config.json').write_text(json.dumps(config))
        (self.root / 'ios/App/App/config.xml').write_text('<widget/>')
        (self.root / 'ios/App/App/PrivacyInfo.xcprivacy').write_bytes(plistlib.dumps({'NSPrivacyTracking': False}))
        self.expected = assets.snapshot(self.root)

    def archive(self, mutate=None):
        files = {str(path.relative_to(self.root / 'ios/App/App')).replace('\\', '/'): path.read_bytes()
                 for path in (self.root / 'ios/App/App').rglob('*') if path.is_file()}
        files['Info.plist'] = plistlib.dumps({'CFBundleIdentifier': assets.BUNDLE, 'CFBundleShortVersionString': '4.58', 'CFBundleVersion': '194'})
        if mutate:
            mutate(files)
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            for name, content in files.items():
                archive.writestr('Payload/App.app/' + name, content)
        data.seek(0)
        return zipfile.ZipFile(data)

    def test_full_snapshot_and_zip_match(self):
        with self.archive() as archive:
            self.assertEqual(assets.inspect_zip(archive, self.expected), 'Payload/App.app/')

    def test_stale_css_rejected(self):
        with self.archive(lambda files: files.update({'public/assets/styles.css': b'old'})) as archive:
            with self.assertRaisesRegex(ValueError, 'web assets'):
                assets.inspect_zip(archive, self.expected)

    def test_missing_asset_rejected(self):
        with self.archive(lambda files: files.pop('public/index.html')) as archive:
            with self.assertRaises(ValueError):
                assets.inspect_zip(archive, self.expected)

    def test_unexpected_asset_rejected(self):
        with self.archive(lambda files: files.update({'public/old-entry.mjs': b'old'})) as archive:
            with self.assertRaises(ValueError):
                assets.inspect_zip(archive, self.expected)

    def test_wrong_version_rejected(self):
        with self.archive(lambda files: files.update({'Info.plist': plistlib.dumps({'CFBundleIdentifier': assets.BUNDLE, 'CFBundleShortVersionString': '4.55', 'CFBundleVersion': '191'})})) as archive:
            with self.assertRaisesRegex(ValueError, 'version/build'):
                assets.inspect_zip(archive, self.expected)

    def test_changed_native_config_rejected(self):
        with self.archive(lambda files: files.update({'capacitor.config.json': b'{}'})) as archive:
            with self.assertRaisesRegex(ValueError, 'configuration'):
                assets.inspect_zip(archive, self.expected)

    def test_changed_privacy_manifest_rejected(self):
        with self.archive(lambda files: files.update({'PrivacyInfo.xcprivacy': b'changed'})) as archive:
            with self.assertRaises(ValueError):
                assets.inspect_zip(archive, self.expected)

    def test_privacy_plist_binary_conversion_preserves_declaration(self):
        data = plistlib.dumps(self.expected['privacyManifest'], fmt=plistlib.FMT_BINARY)
        with self.archive(lambda files: files.update({'PrivacyInfo.xcprivacy': data})) as archive:
            self.assertEqual(assets.inspect_zip(archive, self.expected), 'Payload/App.app/')

    def test_remote_url_rejected_before_build(self):
        with self.assertRaisesRegex(ValueError, 'server.url'):
            assets.validate_config(json.dumps({'appId': assets.BUNDLE, 'webDir': 'www', 'server': {'url': 'https://other.invalid'}}))

    def test_nonempty_cordova_extra_rejected(self):
        (self.root / 'ios/App/App/public/cordova.js').write_bytes(b'plugin')
        with self.assertRaisesRegex(ValueError, 'Cordova'):
            assets.snapshot(self.root)

    def test_duplicate_zip_entry_rejected(self):
        data = io.BytesIO()
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            with zipfile.ZipFile(data, 'w') as archive:
                archive.writestr('duplicate', b'a')
                archive.writestr('duplicate', b'b')
        data.seek(0)
        with zipfile.ZipFile(data) as archive:
            with self.assertRaisesRegex(ValueError, 'Duplicate'):
                assets.inspect_zip(archive, self.expected)

    def test_unsafe_zip_entry_rejected(self):
        with self.archive(lambda files: files.update({'../../escape': b'bad'})) as archive:
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                assets.inspect_zip(archive, self.expected)

class ProfileTests(unittest.TestCase):
    def setUp(self):
        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        self.signed = {'application-identifier': assets.TEAM + '.' + assets.BUNDLE,
                       'com.apple.developer.team-identifier': assets.TEAM,
                       'get-task-allow': False, 'com.apple.developer.applesignin': ['Default'],
                       'com.apple.developer.associated-domains': ['applinks:sogrim-hesbon-app.vercel.app', 'webcredentials:sogrim-hesbon-app.vercel.app']}
        self.profile = {'Name': 'Sogrim Hashbon App Store 2026', 'TeamIdentifier': [assets.TEAM],
                        'CreationDate': now - datetime.timedelta(days=1), 'ExpirationDate': now + datetime.timedelta(days=1),
                        'Entitlements': copy.deepcopy(self.signed), 'DeveloperCertificates': [b'synthetic-certificate']}
        self.original_sha = assets.CERT_SHA256
        assets.CERT_SHA256 = assets.digest(b'synthetic-certificate')
        self.addCleanup(setattr, assets, 'CERT_SHA256', self.original_sha)

    def test_valid_distribution_profile(self):
        self.assertTrue(assets.validate_profile(self.profile, self.signed)['profileValidAtVerification'])

    def test_expired_profile_rejected(self):
        self.profile['ExpirationDate'] -= datetime.timedelta(days=2)
        with self.assertRaisesRegex(ValueError, 'expired'):
            assets.validate_profile(self.profile, self.signed)

    def test_debug_entitlement_rejected(self):
        self.signed['get-task-allow'] = True
        with self.assertRaisesRegex(ValueError, 'Debug'):
            assets.validate_profile(self.profile, self.signed)

    def test_device_profile_rejected(self):
        self.profile['ProvisionedDevices'] = ['synthetic-device']
        with self.assertRaisesRegex(ValueError, 'App Store'):
            assets.validate_profile(self.profile, self.signed)

    def test_missing_apple_signin_rejected(self):
        self.signed.pop('com.apple.developer.applesignin')
        with self.assertRaisesRegex(ValueError, 'Apple sign-in'):
            assets.validate_profile(self.profile, self.signed)

    def test_wrong_certificate_rejected(self):
        self.profile['DeveloperCertificates'] = [b'unrelated']
        with self.assertRaisesRegex(ValueError, 'certificate'):
            assets.validate_profile(self.profile, self.signed)

if __name__ == '__main__':
    unittest.main()
