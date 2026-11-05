import hashlib
import importlib.util
import io
import json
import pathlib
import stat
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'scripts/qa/android-abcb-emulator-36310.py'
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
        self.assets = {f'fonts/test-{i}.woff2' if i < 13 else f'file-{i}.txt': f'synthetic-{i}'.encode() for i in range(283)}
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
        self.assertEqual(receipt['assetCount'], 283)
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


class EmulatorReplacementTests(unittest.TestCase):
    setUp = HistoricalArtifactTests.setUp
    sdk = HistoricalArtifactTests.sdk
    def emulator_zip(self, changed=None, *, special=None):
        files = {'emulator/source.properties': b'Pkg.Revision=36.3.10\nPkg.Path=emulator\nPkg.BuildId=14472402\n',
                 'emulator/lib/advancedFeatures.ini': b'GLDirectMem=off\nHasSharedSlotsHostMemoryAllocator=on\n',
                 **{name: b'synthetic executable' for name in historical.EXECUTABLES}}
        if changed:
            files.update(changed)
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            for name, content in files.items():
                entry = zipfile.ZipInfo(name)
                # ZipInfo normalizes backslashes on Windows; retain the unsafe input for this rejection test.
                entry.filename = name
                entry.orig_filename = name
                entry.create_system = 3
                entry.external_attr = (stat.S_IFREG | (0o755 if name in historical.EXECUTABLES else 0o644)) << 16
                if special and name == special[0]:
                    entry.external_attr = special[1] << 16
                archive.writestr(entry, content)
        path = self.root / 'emulator.zip'
        path.write_bytes(data.getvalue())
        self.enterContext(patch.multiple(historical, EMULATOR_BYTES=path.stat().st_size,
                          EMULATOR_SHA256=historical.file_sha(path), EMULATOR_ENTRIES=len(files),
                          EMULATOR_FILES={name: historical.sha(files[name]) for name in historical.EMULATOR_FILES}))
        return path

    def install_inputs(self):
        sdk, release = self.sdk()
        self.xml = b'<?xml version="1.0"?><sdk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:repo="urn:synthetic"><localPackage path="emulator"><type-details xsi:type="repo:genericDetailsType"/><revision><major>37</major><minor>2</minor><micro>13</micro></revision><display-name>Android Emulator</display-name></localPackage></sdk>'
        (sdk / 'emulator/package.xml').write_bytes(self.xml)
        (sdk / 'emulator/original-marker').write_bytes(b'original host binary')
        owned = self.root / 'runner-temp'
        owned.mkdir()
        return sdk, release, owned, self.emulator_zip()

    def test_installs_only_official_emulator_preserving_guest_backup_and_xml_namespaces(self):
        sdk, release, owned, archive = self.install_inputs()
        guest = {name: (sdk / name).read_bytes() for name in historical.SDK_FILES if not name.startswith('emulator/')}
        receipt = historical.install_emulator(sdk, archive, owned, release)
        backup = pathlib.Path(receipt['originalEmulatorBackup'])
        self.assertEqual((backup / 'original-marker').read_bytes(), b'original host binary')
        self.assertEqual((backup / 'package.xml').read_bytes(), self.xml)
        expected_xml = self.xml.replace(b'<major>37</major><minor>2</minor><micro>13</micro>', b'<major>36</major><minor>3</minor><micro>10</micro>')
        self.assertEqual((sdk / 'emulator/package.xml').read_bytes(), expected_xml)
        self.assertFalse(backup.is_relative_to(sdk))
        self.assertEqual(receipt['baseline']['emulator'], '37.2.13')
        self.assertEqual(receipt['replacement']['emulator'], '36.3.10')
        self.assertFalse(receipt['nativeAcceptance'])
        self.assertFalse(receipt['anrFixed'])
        for name, content in guest.items():
            self.assertEqual((sdk / name).read_bytes(), content)
        for name in historical.EXECUTABLES:
            self.assertEqual((sdk / name).read_bytes(), b'synthetic executable')
            if historical.sys.platform != 'win32':
                self.assertEqual((sdk / name).stat().st_mode & 0o777, 0o755)

    def test_wrong_archive_length_or_digest_never_moves_original(self):
        sdk, release, owned, archive = self.install_inputs()
        for changed in [{'EMULATOR_BYTES': archive.stat().st_size + 1}, {'EMULATOR_SHA256': '0' * 64}]:
            with patch.multiple(historical, **changed), self.assertRaisesRegex(ValueError, 'Official emulator ZIP'):
                historical.install_emulator(sdk, archive, owned, release)
            self.assertTrue((sdk / 'emulator/original-marker').exists())
            self.assertEqual(list(owned.iterdir()), [])

    def test_unsafe_archive_paths_symlinks_modes_or_package_xml_are_rejected(self):
        for changed, special in [({'../escape': b'x'}, None), ({'emulator/../../escape': b'x'}, None),
                                 ({'emulator\\escape': b'x'}, None), ({'emulator/package.xml': b'x'}, None),
                                 ({}, ('emulator/emulator', stat.S_IFLNK | 0o777)),
                                 ({}, ('emulator/emulator', stat.S_IFREG | 0o644))]:
            with self.subTest(changed=changed, special=special):
                archive = self.emulator_zip(changed, special=special)
                # Exercise Linux ZIP parsing on Windows too; ZipInfo otherwise rewrites backslashes while reading.
                with patch.object(historical.zipfile.os, 'sep', '/'), self.assertRaises(ValueError):
                    historical.verify_emulator_archive(archive)

    def test_changed_revision_build_or_member_hash_is_rejected(self):
        for props in [b'Pkg.Revision=37.2.13\nPkg.Path=emulator\nPkg.BuildId=14472402',
                      b'Pkg.Revision=36.3.10\nPkg.Path=emulator\nPkg.BuildId=14214601']:
            with self.assertRaisesRegex(ValueError, 'revision/build'):
                historical.verify_emulator_archive(self.emulator_zip({'emulator/source.properties': props}))
        archive = self.emulator_zip()
        with patch.dict(historical.EMULATOR_FILES, {'emulator/source.properties': '0' * 64}), self.assertRaisesRegex(ValueError, 'member SHA256'):
            historical.verify_emulator_archive(archive)

    def test_existing_staging_backup_or_nested_roots_never_moves_original(self):
        sdk, release, owned, archive = self.install_inputs()
        for name in ['android-abcb-emulator-36310-stage', 'android-abcb-emulator-37213-original']:
            target = owned / name
            target.mkdir()
            with self.assertRaisesRegex(ValueError, 'existing staging/backup'):
                historical.install_emulator(sdk, archive, owned, release)
            target.rmdir()
        with self.assertRaisesRegex(ValueError, 'roots must be separate'):
            historical.install_emulator(sdk, archive, sdk, release)
        self.assertTrue((sdk / 'emulator/original-marker').exists())

    def test_guest_drift_and_wrong_host_fail_before_any_staging(self):
        sdk, release, owned, archive = self.install_inputs()
        with patch.object(historical.platform, 'system', return_value='Windows'), self.assertRaisesRegex(ValueError, 'Linux'):
            historical.install_emulator(sdk, archive, owned, release)
        image = sdk / 'system-images/android-36.1/google_apis_playstore/x86_64/source.properties'
        image.write_bytes(image.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'SHA256 differs'):
            historical.install_emulator(sdk, archive, owned, release)
        self.assertEqual(list(owned.iterdir()), [])

    def test_post_swap_validation_failure_restores_original_and_preserves_rejected_tree(self):
        sdk, release, owned, archive = self.install_inputs()
        verify = historical.verify_sdk
        def reject_replacement(*args, **kwargs):
            if kwargs.get('replacement'):
                raise ValueError('synthetic post-swap validation failure')
            return verify(*args, **kwargs)
        with patch.object(historical, 'verify_sdk', side_effect=reject_replacement), self.assertRaisesRegex(ValueError, 'post-swap'):
            historical.install_emulator(sdk, archive, owned, release)
        self.assertEqual((sdk / 'emulator/package.xml').read_bytes(), self.xml)
        self.assertTrue((sdk / 'emulator/original-marker').exists())
        self.assertTrue((owned / 'android-abcb-emulator-36310-stage/rejected-emulator/emulator').exists())

    def test_package_xml_ambiguous_or_wrong_revision_is_rejected_without_reserializing(self):
        for original in [b'<sdk/>', b'<sdk><localPackage path="other"/></sdk>',
                         b'<sdk><localPackage path="emulator"><revision><major>36</major><minor>3</minor><micro>10</micro></revision></localPackage></sdk>']:
            with self.assertRaises(ValueError):
                historical.replacement_package_xml(original)
        namespaced = b'<sdk xmlns:r="urn:repo"><r:localPackage path="emulator"><r:revision><r:major>37</r:major><r:minor>2</r:minor><r:micro>13</r:micro></r:revision></r:localPackage></sdk>'
        self.assertEqual(historical.package_revision(historical.replacement_package_xml(namespaced)), '36.3.10')


if __name__ == '__main__':
    unittest.main()
