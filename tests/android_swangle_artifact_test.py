import hashlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'scripts/qa/android-swangle-compatibility/artifact.py'
spec = importlib.util.spec_from_file_location('historical', SCRIPT)
historical = importlib.util.module_from_spec(spec)
spec.loader.exec_module(historical)


def zipped(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return output.getvalue()


class HistoricalArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.assets = {f'fonts/test-{i}.woff2' if i < 13 else f'file-{i}.txt': f'synthetic-{i}'.encode() for i in range(284)}
        self.apk = zipped({'assets/public/' + name: data for name, data in self.assets.items()})
        self.audit = {'sourceCommit': historical.SOURCE, 'sourceTree': historical.TREE, 'nativeDiagnosticAbsent': True, 'ready': True, 'apkSha256': historical.sha(self.apk), 'errors': [], 'assets': [{'path': name, 'length': len(data), 'sha256': historical.sha(data), 'font': name.endswith('.woff2')} for name, data in self.assets.items()]}
        self.fixture = {'sourceCommit': historical.SOURCE, 'sourceTree': historical.TREE, 'nativeDiagnosticAbsent': True, 'bootstrapIsSynthetic': True, 'privateEnvDisabled': True}

    def archive(self, *, apk=None, audit=None, fixture=None, tools=None):
        files = {historical.APK_PATH: self.apk if apk is None else apk, historical.NATIVE + 'apk-assets.json': json.dumps(self.audit if audit is None else audit), historical.NATIVE + 'fixture-provenance.json': json.dumps(self.fixture if fixture is None else fixture), historical.NATIVE + 'qa-tools-source.txt': tools or historical.TOOLS + '\n'}
        data = zipped(files)
        target = self.root / 'original.zip'
        target.write_bytes(data)
        self.enterContext(patch.multiple(historical, ARCHIVE_SHA256=historical.sha(data), ARCHIVE_BYTES=len(data), APK_SHA256=historical.sha(self.apk)))
        return target

    def checkout(self):
        checkout = self.root / 'checkout'
        plugin = checkout / 'android/app/src/main/java/com/sogrimhashbon/app/SogrimCapabilitiesPlugin.java'
        plugin.parent.mkdir(parents=True)
        plugin.write_text('synthetic plugin without diagnostic probe')
        for name, data in self.assets.items():
            if name.endswith('.woff2'):
                target = checkout / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
        self.enterContext(patch.object(historical.subprocess, 'check_output', side_effect=lambda args, **kwargs: historical.TREE if args[-1] == 'HEAD^{tree}' else historical.SOURCE))
        return checkout

    def test_prepares_original_bytes_and_all_assets_without_rebuilding(self):
        archive, checkout = self.archive(), self.checkout()
        receipt = historical.prepare(archive, checkout)
        self.assertEqual((checkout / historical.APK_PATH).read_bytes(), self.apk)
        self.assertEqual(receipt['assetCount'], 284)
        self.assertEqual(receipt['fontCount'], 13)
        self.assertFalse(receipt['originalApkRebuilt'])
        self.assertFalse(receipt['nativeAcceptance'])

    def test_archive_and_apk_tampering_fail(self):
        archive = self.archive()
        archive.write_bytes(archive.read_bytes() + b'tampered')
        with self.assertRaisesRegex(ValueError, 'byte length'):
            historical.read_original_archive(archive)
        archive = self.archive(apk=self.apk + b'tampered')
        with self.assertRaisesRegex(ValueError, 'APK SHA256'):
            historical.read_original_archive(archive)

    def test_same_length_archive_digest_mismatch_fails(self):
        archive = self.archive()
        with patch.object(historical, 'ARCHIVE_SHA256', '0' * 64), self.assertRaisesRegex(ValueError, 'artifact SHA256'):
            historical.read_original_archive(archive)

    def test_wrong_source_tools_or_diagnostic_provenance_fail(self):
        for changed in [{'sourceCommit': '0' * 40}, {'sourceTree': '0' * 40}, {'nativeDiagnosticAbsent': False}, {'bootstrapIsSynthetic': False}, {'privateEnvDisabled': False}]:
            with self.subTest(changed=changed):
                archive = self.archive(fixture={**self.fixture, **changed})
                with self.assertRaises(ValueError):
                    historical.read_original_archive(archive)
        with self.assertRaisesRegex(ValueError, 'QA tools'):
            historical.read_original_archive(self.archive(tools='0' * 40))

    def test_asset_mismatch_missing_and_duplicate_inventory_fail(self):
        for changed in [{**self.audit['assets'][0], 'sha256': '0' * 64}, {**self.audit['assets'][0], 'path': '../escape'}]:
            audit = {**self.audit, 'assets': [changed, *self.audit['assets'][1:]]}
            with self.assertRaises(ValueError):
                historical.read_original_archive(self.archive(audit=audit))
        audit = {**self.audit, 'assets': [self.audit['assets'][1], *self.audit['assets'][1:]]}
        with self.assertRaisesRegex(ValueError, 'Duplicate audit'):
            historical.read_original_archive(self.archive(audit=audit))
        with self.assertRaisesRegex(ValueError, 'inventory'):
            historical.read_original_archive(self.archive(audit={**self.audit, 'assets': self.audit['assets'][1:]}))

    def test_no_write_before_source_or_font_or_existing_destination_validation(self):
        archive, checkout = self.archive(), self.checkout()
        (checkout / 'fonts/test-0.woff2').write_bytes(b'wrong source font')
        with self.assertRaisesRegex(ValueError, 'Bundled font'):
            historical.prepare(archive, checkout)
        self.assertFalse((checkout / historical.APK_PATH).exists())
        (checkout / 'fonts/test-0.woff2').write_bytes(self.assets['fonts/test-0.woff2'])
        target = checkout / historical.APK_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b'never overwrite')
        with self.assertRaisesRegex(ValueError, 'Refuse overwrite'):
            historical.prepare(archive, checkout)
        self.assertEqual(target.read_bytes(), b'never overwrite')

    def test_wrong_checkout_identity_never_writes_artifact(self):
        archive, checkout = self.archive(), self.checkout()
        with patch.object(historical.subprocess, 'check_output', return_value='0' * 40), self.assertRaisesRegex(ValueError, 'checkout identity'):
            historical.prepare(archive, checkout)
        self.assertFalse((checkout / historical.APK_PATH).exists())

    def sdk(self):
        files = {'emulator/source.properties': b'Pkg.Revision=37.2.13\n', 'emulator/lib/advancedFeatures.ini': b'GLDirectMem=off\n', 'system-images/android-36.1/google_apis_playstore/x86_64/source.properties': b'Pkg.Revision=4\nAndroidVersion.ApiLevel=36.1\nSystemImage.Abi=x86_64\nSystemImage.TagId=google_apis_playstore\n', 'system-images/android-36.1/google_apis_playstore/x86_64/advancedFeatures.ini': b'GLDirectMem=on\n'}
        sdk = self.root / 'sdk'
        for name, data in files.items():
            target = sdk / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        release = self.root / 'os-release'
        release.write_text('ID=ubuntu\nVERSION_ID="24.04"\n')
        self.enterContext(patch.object(historical, 'SDK_FILES', {name: historical.sha(data) for name, data in files.items()}))
        self.enterContext(patch.object(historical.platform, 'system', return_value='Linux'))
        self.enterContext(patch.object(historical.platform, 'machine', return_value='x86_64'))
        return sdk, release

    def test_only_exact_linux_sdk_is_accepted(self):
        sdk, release = self.sdk()
        self.assertTrue(historical.verify_sdk(sdk, release)['matched'])
        (sdk / 'emulator/source.properties').write_text('Pkg.Revision=latest\n')
        with self.assertRaisesRegex(ValueError, 'SHA256 differs'):
            historical.verify_sdk(sdk, release)

    def test_host_image_and_revision_mismatches_are_failures_even_with_matching_hash(self):
        sdk, release = self.sdk()
        with patch.object(historical.platform, 'system', return_value='Windows'), self.assertRaisesRegex(ValueError, 'Linux'):
            historical.verify_sdk(sdk, release)
        release.write_text('ID=ubuntu\nVERSION_ID="26.04"\n')
        with self.assertRaisesRegex(ValueError, 'Ubuntu24.04'):
            historical.verify_sdk(sdk, release)
        release.write_text('ID=ubuntu\nVERSION_ID="24.04"\n')
        target = sdk / 'emulator/source.properties'
        target.write_text('Pkg.Revision=36.3.10\n')
        with patch.dict(historical.SDK_FILES, {'emulator/source.properties': historical.file_sha(target)}), self.assertRaisesRegex(ValueError, 'emulator37.2.13'):
            historical.verify_sdk(sdk, release)
        target.write_bytes(b'Pkg.Revision=37.2.13\n')
        image = sdk / 'system-images/android-36.1/google_apis_playstore/x86_64/source.properties'
        image.write_text(image.read_text().replace('Pkg.Revision=4', 'Pkg.Revision=5'))
        with patch.dict(historical.SDK_FILES, {'system-images/android-36.1/google_apis_playstore/x86_64/source.properties': historical.file_sha(image)}), self.assertRaisesRegex(ValueError, 'revision4 image'):
            historical.verify_sdk(sdk, release)

    def test_raw_source_bytes_reject_line_ending_or_content_drift(self):
        target = self.root / 'probe.mjs'
        data = b'export const synthetic = true;\n'
        target.write_bytes(data)
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        entries = ('100644 blob ' + blob + '\tprobe.mjs\0').encode()
        self.assertEqual(len(historical.verify_tracked_files(self.root, entries)), 1)
        target.write_bytes(data.replace(b'\n', b'\r\n'))
        with self.assertRaisesRegex(ValueError, 'Raw original source bytes differ'):
            historical.verify_tracked_files(self.root, entries)

    def test_raw_source_refuses_escape_and_unsupported_file_kind(self):
        for entry in [b'100644 blob abc\t../foreign.mjs\0', b'120000 blob abc\tredirect\0']:
            with self.assertRaises(ValueError):
                historical.verify_tracked_files(self.root, entry)

    def binary_sdk(self):
        sdk = self.root / 'binary-sdk'
        for name in ['emulator/emulator', 'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless', 'emulator/lib64/libsynthetic.so']:
            path = sdk / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'\x7fELFsynthetic-never-executed')
        return sdk

    def test_sdk_binary_fingerprint_hashes_required_executables_and_libraries(self):
        sdk = self.binary_sdk()
        receipt = historical.fingerprint_sdk(sdk)
        self.assertEqual(len(receipt['files']), 3)
        self.assertFalse(receipt['historicalBinaryComparison'])
        self.assertEqual(receipt['coverage'], 'emulator-elf-tree-v1')
        self.assertTrue(all(row['sha256'] == historical.sha(b'\x7fELFsynthetic-never-executed') for row in receipt['files']))

    def test_sdk_binary_fingerprint_rejects_missing_or_non_elf_required_files(self):
        sdk = self.binary_sdk()
        target = sdk / 'emulator/emulator'
        target.write_bytes(b'not an executable')
        with self.assertRaisesRegex(ValueError, 'not ELF'):
            historical.fingerprint_sdk(sdk)
        target.unlink()
        with self.assertRaises(FileNotFoundError):
            historical.fingerprint_sdk(sdk)

    def test_sdk_binary_fingerprint_refuses_foreign_paths_and_missing_libraries(self):
        sdk = self.binary_sdk()
        foreign = self.root / 'foreign'
        foreign.write_bytes(b'\x7fELFforeign')
        with self.assertRaisesRegex(ValueError, 'escapes'):
            historical.fingerprint_file(sdk, foreign)
        (sdk / 'emulator/lib64/libsynthetic.so').unlink()
        (sdk / 'emulator/extra-elf').write_bytes(b'\x7fELFsynthetic-never-executed')
        with self.assertRaisesRegex(ValueError, 'No ELF'):
            historical.fingerprint_sdk(sdk)


if __name__ == '__main__':
    unittest.main()
