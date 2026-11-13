import importlib.util
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[3]
def module(path,name):
    spec=importlib.util.spec_from_file_location(name,path);result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
tool=module(Path(__file__).with_name('read-qa522-original-private.py'),'private_original')
reader=module(ROOT/'scripts/qa/native-auth-session/inspect-original-xcresult.py','original_reader')

class OriginalPrivateReaderTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory(prefix='private-original-reader-');self.root=Path(self.tmp.name).resolve();self.parent=Path(tempfile.gettempdir()).resolve()
    def tearDown(self):
        self.assertEqual(self.root.parent,self.parent);self.assertTrue(self.root.name.startswith('private-original-reader-'));self.tmp.cleanup()
    def archive(self,extras=()):
        target=self.root/'original.zip'
        with zipfile.ZipFile(target,'w')as z:
            z.writestr('default/result.xcresult/Info.plist',b'original plist bytes');z.writestr('default/result.xcresult/Data/data.bin',b'original payload bytes')
            for name,body in extras:z.writestr(name,body)
        return target
    def test_extracts_original_bundle_without_changing_payloads(self):
        result=tool.extract_original_result(self.archive([('source.log',b'not a bundle')]),self.root/'out',reader)
        self.assertTrue(result['allOriginalCrcsPassed']);self.assertEqual(result['resultMembers'],2);self.assertEqual((self.root/'out/result.xcresult/Data/data.bin').read_bytes(),b'original payload bytes');self.assertFalse((self.root/'out/source.log').exists())
    def test_rejects_traversal_before_extraction(self):
        with self.assertRaises(reader.EvidenceError):tool.extract_original_result(self.archive([('../escape',b'no')]),self.root/'out',reader)
        self.assertFalse((self.root/'out').exists())
    def test_rejects_casefold_duplicates(self):
        with self.assertRaises(reader.EvidenceError):tool.extract_original_result(self.archive([('default/result.xcresult/info.plist',b'no')]),self.root/'out',reader)
    def test_rejects_symlinks(self):
        archive=self.archive();link=zipfile.ZipInfo('default/result.xcresult/link');link.external_attr=(stat.S_IFLNK|0o777)<<16
        with zipfile.ZipFile(archive,'a')as z:z.writestr(link,'/outside')
        with self.assertRaises(reader.EvidenceError):tool.extract_original_result(archive,self.root/'out',reader)
    def test_missing_bundle_does_not_create_an_output(self):
        archive=self.root/'empty.zip'
        with zipfile.ZipFile(archive,'w')as z:z.writestr('other.log',b'no bundle')
        with self.assertRaises(reader.EvidenceError):tool.extract_original_result(archive,self.root/'out',reader)
        self.assertFalse((self.root/'out').exists())
    def test_private_payload_contains_only_export_and_private_reader_log(self):
        private=self.root/'private';(private/'export').mkdir(parents=True);(private/'export/summary.json').write_text('{"private":"synthetic diagnostic"}');(private/'read.log').write_text('private log');(private/'original.zip').write_text('exclude archive');(private/'extracted').mkdir();(private/'extracted/other').write_text('exclude extraction')
        target=self.root/'payload.tar.gz';tool.pack(private,target,0)
        with tarfile.open(target)as t:self.assertEqual(sorted(t.getnames()),['export/summary.json','inspection-status.json','read.log'])
    def test_pack_refuses_an_empty_inspection(self):
        private=self.root/'private';private.mkdir()
        with self.assertRaises(AssertionError):tool.pack(private,self.root/'payload.tar.gz',1)

if __name__=='__main__':unittest.main()
