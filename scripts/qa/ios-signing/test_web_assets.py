import copy
import datetime
import io
import json
import os
import pathlib
import plistlib
import shutil
import subprocess
import tempfile
import tarfile
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
        for name, data in {'index.html': b'<html>synthetic 516</html>', 'assets/styles.css': b'button{min-height:44px}'}.items():
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

    def canonical(self):
        return {'sourceCommit': assets.SOURCE, 'sourceTree': assets.TREE,
                'gitInputCount': 501, 'allArchiveBytesMatchGitBlobs': True,
                'independentCanonicalBuild': True, 'www': self.expected['www']}

    def test_canonical_snapshot_accepts_matching_bytes(self):
        self.assertEqual(assets.snapshot(self.root, self.canonical())['www'], self.expected['www'])

    def test_canonical_rejects_colluding_stale_www_and_ipa_source(self):
        # OLD controls only that WWW and the copied public directory agree.
        # Mutate both: that old boundary accepts, the new independent proof rejects.
        for name in ('www/assets/styles.css', 'ios/App/App/public/assets/styles.css'):
            (self.root / name).write_bytes(b'old but identical on both sides')
        old_snapshot = assets.snapshot(self.root)
        with self.archive() as archive:
            self.assertEqual(assets.inspect_zip(archive, old_snapshot), 'Payload/App.app/')
        with self.assertRaisesRegex(ValueError, 'canonical Git bytes'):
            assets.snapshot(self.root, self.canonical())

    def test_canonical_rejects_generated_entry_difference(self):
        (self.root / 'www/index.html').write_bytes(b'wrong generated bootstrap')
        with self.assertRaisesRegex(ValueError, 'canonical Git bytes'):
            assets.snapshot(self.root, self.canonical())

    def test_canonical_rejects_wrong_source_and_missing_git_proof(self):
        for change in ({'sourceTree': '0' * 40}, {'sourceCommit': '0' * 40},
                       {'gitInputCount': 0}, {'independentCanonicalBuild': False},
                       {'allArchiveBytesMatchGitBlobs': False}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                assets.snapshot(self.root, {**self.canonical(), **change})

    def test_canonical_rejects_missing_and_extra_files(self):
        for change in ({}, {**self.expected['www'], 'extra.mjs': '0' * 64}):
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'canonical Git bytes'):
                assets.compare_canonical_www(self.expected['www'], change)

    def test_signing_acceptance_requires_independent_canonical_receipt(self):
        with self.assertRaisesRegex(ValueError, 'canonical Git proof is required'):
            assets.verify(self.root, self.expected)

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

class GitArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).parent)
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.payload = b'canonical raw Git bytes\r\n'
        self.blob = assets.hashlib.sha1(b'blob ' + str(len(self.payload)).encode() + b'\0' + self.payload).hexdigest()

    def archive(self, name='src/input.mjs', content=None, kind=tarfile.REGTYPE, duplicate=False):
        data = io.BytesIO()
        payload = self.payload if content is None else content
        with tarfile.open(fileobj=data, mode='w') as archive:
            for _ in range(2 if duplicate else 1):
                entry = tarfile.TarInfo(name)
                entry.type = kind
                entry.size = len(payload) if kind == tarfile.REGTYPE else 0
                archive.addfile(entry, io.BytesIO(payload) if kind == tarfile.REGTYPE else None)
        data.seek(0)
        return data

    def test_raw_git_blob_bytes_are_exported_without_line_ending_conversion(self):
        assets.extract_git_archive(self.archive(), self.root, {'src/input.mjs': self.blob})
        self.assertEqual((self.root / 'src/input.mjs').read_bytes(), self.payload)

    def test_changed_archive_blob_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'differ from Git blob'):
            assets.extract_git_archive(self.archive(content=b'changed'), self.root, {'src/input.mjs': self.blob})

    def test_duplicate_and_untracked_entries_are_rejected(self):
        for stream, expected in ((self.archive(duplicate=True), {'src/input.mjs': self.blob}),
                                 (self.archive(), {})):
            with self.assertRaisesRegex(ValueError, 'Unexpected, duplicate'):
                assets.extract_git_archive(stream, self.root, expected)

    def test_symlink_and_traversal_are_rejected(self):
        for name, kind in (('../escape', tarfile.REGTYPE), ('/escape', tarfile.REGTYPE),
                           ('src/link.mjs', tarfile.SYMTYPE)):
            with self.subTest(name=name), self.assertRaises(ValueError):
                assets.extract_git_archive(self.archive(name=name, kind=kind), self.root, {name: self.blob})

    def test_missing_git_file_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            assets.extract_git_archive(self.archive(), self.root,
                                       {'src/input.mjs': self.blob, 'src/other.mjs': self.blob})

    def test_git_autocrlf_old_fails_raw_blob_guard_and_final_passes(self):
        git = os.environ.get('CANONICAL_TEST_GIT') or shutil.which('git')
        self.assertTrue(git, 'Git is required for the real archive regression control')
        def run(*argv, data=None):
            return subprocess.run([git, *argv], cwd=self.root, input=data,
                                  check=True, capture_output=True).stdout
        run('init', '-q')
        run('config', 'core.autocrlf', 'true')
        payload = b'canonical\nsource\n'
        blob = run('hash-object', '-w', '--stdin', data=payload).decode().strip()
        tree = run('mktree', data=('100644 blob ' + blob + '\tinput.mjs\n').encode()).decode().strip()
        old = run('archive', '--format=tar', tree)
        with self.assertRaisesRegex(ValueError, 'differ from Git blob'):
            assets.extract_git_archive(io.BytesIO(old), self.root / 'old', {'input.mjs': blob})
        final = subprocess.run(assets.canonical_archive_command(tree, git), cwd=self.root,
                               check=True, capture_output=True).stdout
        assets.extract_git_archive(io.BytesIO(final), self.root / 'final', {'input.mjs': blob})
        self.assertEqual((self.root / 'final/input.mjs').read_bytes(), payload)

if __name__ == '__main__':
    unittest.main()
