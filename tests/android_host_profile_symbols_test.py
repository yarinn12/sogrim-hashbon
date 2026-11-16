"""Synthetic offline ELF controls; not actual emulator/BPF compatibility proof."""
import copy
import hashlib
import importlib.util
import json
import os
import pathlib
import struct
import tempfile
import unittest
from unittest.mock import patch

SOURCE=pathlib.Path(__file__).resolve().parents[1]/'scripts/qa/android-host-profile/offline-symbols.py'
spec=importlib.util.spec_from_file_location('host_offline_symbols',SOURCE)
symbols=importlib.util.module_from_spec(spec);spec.loader.exec_module(symbols)

def elf_fixture(entries=None,sections=True):
    if entries is None:entries=[(0x501100,0x40,'real_function')]
    data=bytearray(0x2200);data[:16]=b'\x7fELF\x02\x01\x01'+b'\0'*9
    struct.pack_into('<HHIQQQIHHHHHH',data,16,3,62,1,0,64,0x2000 if sections else 0,0,64,56,2,64 if sections else 0,4 if sections else 0,0)
    struct.pack_into('<IIQQQQQQ',data,64,1,5,0x1000,0x501000,0,0x500,0x500,0x1000)
    note=struct.pack('<III',4,20,3)+b'GNU\0'+bytes(range(20));data[0x1800:0x1800+len(note)]=note
    struct.pack_into('<IIQQQQQQ',data,120,4,4,0x1800,0,0,len(note),len(note),4)
    if sections:
        struct.pack_into('<IIQQQQIIQQ',data,0x2040,0,1,6,0x501000,0x1000,0x500,0,0,16,0)
        strings=bytearray(b'\0');syms=bytearray(24)
        for value,size,name in entries:
            pos=len(strings);strings.extend(name.encode()+b'\0');syms.extend(struct.pack('<IBBHQQ',pos,0x12,0,1,value,size))
        data[0x1900:0x1900+len(syms)]=syms;data[0x1a00:0x1a00+len(strings)]=strings
        struct.pack_into('<IIQQQQIIQQ',data,0x2080,0,2,0,0,0x1900,len(syms),3,0,8,24)
        struct.pack_into('<IIQQQQIIQQ',data,0x20c0,0,3,0,0,0x1a00,len(strings),0,0,1,0)
    return bytes(data)

def snapshot(start,end,record):
    device=int(record['device'])
    major=((device>>8)&0xfff)|((device>>32)&0xfffff000);minor=(device&0xff)|((device>>12)&0xffffff00)
    mapping={'start':'0x70000000','end':'0x70000500','permissions':'r-xp','fileOffset':'0x1000','deviceMajor':hex(major),'deviceMinor':hex(minor),'inode':record['inode'],'path':record['path']}
    return {'monotonicStartedNs':str(start),'monotonicCompletedNs':str(end),'mappings':[mapping],'files':[record]}

class OfflineSymbols(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=pathlib.Path(self.temp.name).resolve();self.path=self.root/'public.so';self.path.write_bytes(elf_fixture());info=self.path.stat()
        # Linux /proc mapping names stay POSIX even when local fixture bytes are
        # stored on Windows. Keep the production absolute-Linux-path guard.
        self.record={'path':'/usr/lib/synthetic-public.so','resolved':str(self.path),'inode':str(info.st_ino),'device':str(info.st_dev),'sha256':hashlib.sha256(self.path.read_bytes()).hexdigest(),'buildIds':[bytes(range(20)).hex()]}
        self.before=snapshot(800000000,900000000,self.record);self.after=snapshot(2100000000,2200000000,self.record)
    def test_real_pt_load_virtual_address_differs_from_file_offset(self):
        elf=symbols.parse_elf(elf_fixture());virtual=symbols.elf_address(0x1123,elf);self.assertEqual(virtual,0x501123);self.assertNotEqual(virtual,0x1123)
        found=symbols.symbol_at(virtual,elf);self.assertEqual(found['names'],['real_function']);self.assertEqual(found['offsetInSymbol'],0x23)
    def test_no_nearest_symbol_guess_or_zero_size_extension(self):
        elf=symbols.parse_elf(elf_fixture([(0x501100,0,'zero_size')]))
        self.assertEqual(symbols.symbol_at(0x501100,elf)['names'],['zero_size']);self.assertIsNone(symbols.symbol_at(0x501101,elf));self.assertIsNone(symbols.symbol_at(0x501180,elf))
    def test_stripped_module_has_address_translation_without_invented_function(self):
        elf=symbols.parse_elf(elf_fixture(sections=False));self.assertEqual(symbols.elf_address(0x1123,elf),0x501123);self.assertIsNone(symbols.symbol_at(0x501123,elf))
    def test_overlapping_distinct_ranges_are_ambiguous_but_exact_aliases_are_retained(self):
        elf=symbols.parse_elf(elf_fixture([(0x501100,0x40,'a'),(0x501110,0x40,'b')]))
        with self.assertRaisesRegex(ValueError,'Ambiguous'):symbols.symbol_at(0x501123,elf)
        elf=symbols.parse_elf(elf_fixture([(0x501100,0x40,'a'),(0x501100,0x40,'b')]))
        self.assertEqual(symbols.symbol_at(0x501123,elf)['names'],['a','b'])
    def test_non_executable_or_ambiguous_pt_load_fails(self):
        elf=symbols.parse_elf(elf_fixture());elf['loads'][0]['flags']=4
        with self.assertRaisesRegex(ValueError,'PT_LOAD'):symbols.elf_address(0x1123,elf)
        elf['loads'][0]['flags']=5;elf['loads'].append(dict(elf['loads'][0]))
        with self.assertRaisesRegex(ValueError,'PT_LOAD'):symbols.elf_address(0x1123,elf)
    def test_consistent_before_after_snapshots_are_required(self):
        m,f=symbols.choose_mapping(0x70000123,1000000000,2000000000,[self.before,self.after]);self.assertEqual(f['sha256'],self.record['sha256'])
        with self.assertRaisesRegex(ValueError,'bracket'):symbols.choose_mapping(0x70000123,1000000000,2000000000,[self.before])
    def test_changed_mapping_or_file_identity_is_not_resolved(self):
        for field,value in [('start','0x70000001'),('inode','999999')]:
            after=copy.deepcopy(self.after);after['mappings'][0][field]=value
            with self.assertRaises(ValueError):symbols.choose_mapping(0x70000123,1000000000,2000000000,[self.before,after])
        after=copy.deepcopy(self.after);after['files'][0]['sha256']='f'*64
        with self.assertRaisesRegex(ValueError,'identity changed'):symbols.choose_mapping(0x70000123,1000000000,2000000000,[self.before,after])
    def test_an_intermediate_unload_is_not_hidden_by_matching_endpoints(self):
        middle=copy.deepcopy(self.before);middle.update(monotonicStartedNs='1300000000',monotonicCompletedNs='1400000000',mappings=[])
        with self.assertRaisesRegex(ValueError,'Missing/ambiguous mapping'):symbols.choose_mapping(0x70000123,1000000000,2000000000,[self.before,middle,self.after])
    def test_anonymous_jit_and_mismatched_device_stay_unknown(self):
        after=copy.deepcopy(self.after);after['mappings'][0]['path']=None
        with self.assertRaisesRegex(ValueError,'Anonymous/JIT'):symbols.choose_mapping(0x70000123,1000000000,2000000000,[self.before,after])
        after=copy.deepcopy(self.after);after['files'][0]['device']='0'
        with self.assertRaisesRegex(ValueError,'device differs'):symbols.choose_mapping(0x70000123,1000000000,2000000000,[after,self.before])
    def test_private_paths_are_rejected_before_read(self):
        with self.assertRaisesRegex(ValueError,'public module roots'):symbols.verify_public_module(self.record,100000)
    def test_exact_public_bytes_sha_device_inode_buildid_and_budget(self):
        with patch.object(symbols,'PUBLIC_ROOTS',(str(self.root)+os.sep,)):
            elf,count=symbols.verify_public_module(self.record,100000);self.assertEqual(count,len(elf_fixture()));self.assertEqual(elf['buildIds'],self.record['buildIds'])
            for field,value,reason in [('sha256','0'*64,'SHA'),('inode','999999','inode'),('buildIds',['f'*40],'build-ID')]:
                with self.subTest(field=field),self.assertRaisesRegex(ValueError,reason):symbols.verify_public_module({**self.record,field:value},100000)
            with self.assertRaisesRegex(ValueError,'budget'):symbols.verify_public_module(self.record,1)
    def test_full_offline_receipt_resolves_public_symbols_but_retains_unknown(self):
        data={'profile':{'startedMonotonicNs':'1000000000','completedMonotonicNs':'2000000000','parsed':{'rows':[{'monotonicSecond':'1','frames':['0x70000123','0x90000000',None],'count':7}]}},'snapshots':[self.before,self.after]}
        source=self.root/'input.json';target=self.root/'output.json';source.write_text(json.dumps(data),encoding='utf-8')
        with patch.object(symbols,'PUBLIC_ROOTS',(str(self.root)+os.sep,)):self.assertEqual(symbols.run(source,target),0)
        result=json.loads(target.read_text());self.assertTrue(result['complete']);self.assertEqual(result['addressesWithDeclaredFunctions'],1);self.assertEqual(result['weightedFramesWithDeclaredFunctions'],7);self.assertEqual(result['unknownReasons']['unknown_unwind_frame'],7)
        self.assertEqual(result['functionAttributionAvailability'],'partial');self.assertFalse(result['processMemoryRead']);self.assertFalse(result['releaseAcceptance'])
    def test_address_cap_is_explicit_partial_and_nonzero(self):
        data={'profile':{'startedMonotonicNs':'1000000000','completedMonotonicNs':'2000000000','parsed':{'rows':[{'monotonicSecond':'1','frames':['0x70000123','0x70000124'],'count':1}]}},'snapshots':[self.before,self.after]}
        source=self.root/'input.json';target=self.root/'output.json';source.write_text(json.dumps(data),encoding='utf-8')
        with patch.dict(symbols.LIMITS,uniqueAddresses=1),patch.object(symbols,'PUBLIC_ROOTS',(str(self.root)+os.sep,)):self.assertEqual(symbols.run(source,target),1)
        result=json.loads(target.read_text());self.assertFalse(result['complete']);self.assertTrue(result['addressCapReached']);self.assertEqual(result['addressesProcessed'],1)
    def test_malformed_elf_tables_and_truncated_notes_reject(self):
        with self.assertRaises(ValueError):symbols.parse_elf(b'bad')
        with self.assertRaises(ValueError):symbols.parse_elf(elf_fixture()[:0x1810])

if __name__=='__main__':unittest.main(verbosity=2)
