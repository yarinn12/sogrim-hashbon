import importlib.util
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('certificate_guard', pathlib.Path(__file__).with_name('verify-web-assets.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

class SigningCertificateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='certificate guard ', dir=pathlib.Path(__file__).parent)
        self.addCleanup(self.temp.cleanup)
        self.directory = pathlib.Path(self.temp.name)
        self.app = self.directory / 'Payload' / 'App.app'
        self.app.mkdir(parents=True)
        self.certificate = b'synthetic certificate for command-boundary tests'

    def codesign_extract(self, argv, **options):
        # codesign uses getopt_long optional_argument: a detached prefix is
        # another bundle operand. Model that boundary independently of the helper.
        self.assertEqual(argv[:2], ['/usr/bin/codesign', '-d'])
        operands = [a for a in argv[2:] if not a.startswith('--')]
        if operands != [str(self.app)]:
            raise subprocess.CalledProcessError(1, argv, stderr=b'prefix treated as an unsigned code path')
        attached = [a for a in argv[2:] if a.startswith('--extract-certificates=')]
        prefix = attached[0].split('=', 1)[1] if attached else './codesign'
        self.assertEqual(options, {'check': True, 'capture_output': True})
        pathlib.Path(prefix + '0').write_bytes(self.certificate)
        return subprocess.CompletedProcess(argv, 0)

    def test_extracts_expected_leaf_with_spaces_and_one_bundle_operand(self):
        expected = guard.digest(self.certificate)
        with patch.object(guard, 'CERT_SHA256', expected), patch.object(guard.subprocess, 'run', side_effect=self.codesign_extract):
            self.assertEqual(guard.verify_signing_certificate(self.app, self.directory), expected)
        self.assertEqual((self.directory / 'signing-cert-0').read_bytes(), self.certificate)

    def test_wrong_actual_leaf_is_rejected(self):
        with patch.object(guard.subprocess, 'run', side_effect=self.codesign_extract):
            with self.assertRaisesRegex(ValueError, 'Actual signing certificate differs'):
                guard.verify_signing_certificate(self.app, self.directory)

    def test_missing_leaf_is_rejected(self):
        with patch.object(guard.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
            with self.assertRaises(FileNotFoundError):
                guard.verify_signing_certificate(self.app, self.directory)

    def test_codesign_failure_is_not_swallowed(self):
        failure = subprocess.CalledProcessError(1, ['codesign'], stderr=b'invalid signature')
        with patch.object(guard.subprocess, 'run', side_effect=failure):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                guard.verify_signing_certificate(self.app, self.directory)
        self.assertIs(caught.exception, failure)

if __name__ == '__main__':
    unittest.main()
