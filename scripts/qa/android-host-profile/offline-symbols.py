"""Bounded post-measurement symbol lookup. No memory reads or external symbols.

Use real ELF PT_LOAD and declared FUNC ranges, never file-offset==ELF-address or
nearest-symbol guesses. Only snapshot-consistent, verified public modules qualify.
"""
import bisect
from collections import Counter
import hashlib
import json
import os
import pathlib
import struct
import sys
import time

LIMITS={'seconds':25,'uniqueAddresses':8192,'moduleBytes':1073741824,'inputBytes':134217728,'symbolsPerModule':500000,'symbolOverlapScan':512}
PUBLIC_ROOTS=('/usr/local/lib/android/sdk/emulator/','/usr/lib/','/lib/')

def need(value,message):
    if not value: raise ValueError(message)

def region(data,offset,size):
    need(0<=offset<=len(data) and 0<=size<=len(data)-offset,'ELF range outside file')
    return data[offset:offset+size]

def parse_elf(data):
    need(len(data)>=64 and data[:6]==b'\x7fELF\x02\x01','Only ELF64 little-endian is supported')
    h=struct.unpack_from('<HHIQQQIHHHHHH',data,16)
    need(h[0] in (2,3) and h[1]==62,'Only x86_64 executable/shared ELF')
    need(h[8]==56 and 0<h[9]<=512 and h[11]<=4096 and ((h[10]==64 and h[11]>0) or (h[11]==0 and h[5]==0)),'Unsupported ELF table geometry')
    loads=[];notes=[];sections=[]
    for i in range(h[9]):
        p=struct.unpack('<IIQQQQQQ',region(data,h[4]+i*56,56))
        if p[0]==1: loads.append({'offset':p[2],'vaddr':p[3],'filesz':p[5],'memsz':p[6],'flags':p[1]})
        if p[0]==4: notes.append((p[2],p[5]))
    for i in range(h[11]):
        s=struct.unpack('<IIQQQQIIQQ',region(data,h[5]+i*64,64));sections.append(s)
        if s[1]==7:notes.append((s[4],s[5]))
    build_ids=set()
    for offset,size in set(notes):
        buf=region(data,offset,size);at=0
        while at+12<=len(buf):
            namesz,descsz,kind=struct.unpack_from('<III',buf,at);at+=12
            name=region(buf,at,namesz);at+=(namesz+3)&~3
            desc=region(buf,at,descsz);at+=(descsz+3)&~3
            if kind==3 and name.rstrip(b'\0')==b'GNU':build_ids.add(desc.hex())
    symbols=[];entries_seen=0
    for section in sections:
        if section[1] not in (2,11):continue
        need(section[9]==24 and section[5]%24==0,'Unsupported ELF symbol entry')
        need(0<=section[6]<len(sections),'Invalid string table link')
        strings=sections[section[6]];string_data=region(data,strings[4],strings[5])
        entries_seen+=section[5]//24;need(entries_seen<=LIMITS['symbolsPerModule'],'Symbol table cap exceeded')
        for at in range(section[4],section[4]+section[5],24):
            name,info,other,shndx,value,size=struct.unpack('<IBBHQQ',region(data,at,24))
            if info&15 not in (2,10) or not 0<shndx<len(sections):continue
            need(name<len(string_data),'Invalid symbol name offset');end=string_data.find(b'\0',name);need(end>=name,'Unterminated symbol name')
            label=string_data[name:end].decode('utf-8','replace')
            if label:symbols.append({'value':value,'size':size,'name':label})
    unique={(s['value'],s['size'],s['name']):s for s in symbols};symbols=sorted(unique.values(),key=lambda s:s['value'])
    starts=[s['value'] for s in symbols];maximum=0;prefix=[]
    for symbol in symbols:maximum=max(maximum,symbol['value']+max(symbol['size'],1));prefix.append(maximum)
    return {'loads':loads,'buildIds':sorted(build_ids),'symbols':symbols,'starts':starts,'prefixEnd':prefix}

def elf_address(file_offset,elf):
    matches=[p for p in elf['loads'] if p['flags']&1 and p['offset']<=file_offset<p['offset']+p['filesz']]
    need(len(matches)==1,'No unique executable PT_LOAD for file offset')
    p=matches[0];return p['vaddr']+file_offset-p['offset']

def symbol_at(address,elf):
    index=bisect.bisect_right(elf['starts'],address)-1;matches=[];scanned=0
    while index>=0 and elf['prefixEnd'][index]>address:
        scanned+=1;need(scanned<=LIMITS['symbolOverlapScan'],'Overlapping symbol search cap exceeded')
        s=elf['symbols'][index]
        if (s['size'] and s['value']<=address<s['value']+s['size']) or (not s['size'] and address==s['value']):matches.append(s)
        index-=1
    if not matches:return None
    shapes={(s['value'],s['size']) for s in matches};need(len(shapes)==1,'Ambiguous overlapping FUNC ranges')
    return {'names':sorted({s['name'] for s in matches}),'value':hex(matches[0]['value']),'declaredSize':matches[0]['size'],'offsetInSymbol':address-matches[0]['value'],'evidence':'declared ELF FUNC/IFUNC range; no nearest-symbol guess'}

def mapping_key(row):
    return tuple(row.get(k) for k in ['path','start','end','fileOffset','deviceMajor','deviceMinor','inode'])

def linux_device_parts(device):
    return ((device>>8)&0xfff)|((device>>32)&0xfffff000),(device&0xff)|((device>>12)&0xffffff00)

def choose_mapping(pc,first_ns,last_ns,snapshots):
    before=[s for s in snapshots if int(s['monotonicCompletedNs'])<=first_ns]
    after=[s for s in snapshots if int(s['monotonicStartedNs'])>=last_ns]
    need(before and after,'No before/after mapping snapshots bracket sampled time')
    left=max(before,key=lambda s:int(s['monotonicCompletedNs']));right=min(after,key=lambda s:int(s['monotonicStartedNs']))
    relevant=[s for s in snapshots if int(s['monotonicStartedNs'])>=int(left['monotonicStartedNs']) and int(s['monotonicCompletedNs'])<=int(right['monotonicCompletedNs'])]
    hits=[];records=[]
    for snapshot in relevant:
        matches=[m for m in snapshot['mappings'] if int(m['start'],16)<=pc<int(m['end'],16)]
        need(len(matches)==1,'Missing/ambiguous mapping at a bounding snapshot')
        m=matches[0];need('x' in m['permissions'] and (m.get('path') or '').startswith('/'),'Anonymous/JIT or non-executable mapping')
        hits.append(m)
        files=[f for f in snapshot['files'] if f['path']==m['path'] and f['inode']==m['inode']]
        need(len(files)==1,'No verified public module record for mapping')
        f=files[0];device=linux_device_parts(int(f['device']));need(device==(int(m['deviceMajor'],16),int(m['deviceMinor'],16)),'Recorded module device differs from mapping');records.append(f)
    need(len(hits)>=2 and len({mapping_key(m) for m in hits})==1,'Mapping changed or is ambiguous across snapshots')
    need(len({(f['sha256'],f['inode'],f['device']) for f in records})==1,'Module identity changed across snapshots')
    return hits[0],records[0]

def verify_public_module(record,remaining_bytes):
    path=pathlib.Path(record['resolved']);resolved=path.resolve()
    need(path==resolved and any(str(resolved).startswith(p) for p in PUBLIC_ROOTS),'Outside approved public module roots')
    first=path.stat();need(str(first.st_ino)==record['inode'] and str(first.st_dev)==record['device'],'Current public module device/inode differs')
    need(first.st_size<=remaining_bytes,'Module byte budget exceeded')
    with path.open('rb') as source:
        opened=os.fstat(source.fileno());need((opened.st_ino,opened.st_dev,opened.st_size)==(first.st_ino,first.st_dev,first.st_size),'Opened module identity differs')
        data=source.read(remaining_bytes+1)
    need(len(data)<=remaining_bytes and len(data)==first.st_size,'Module byte budget exceeded or truncated file');last=path.stat()
    need((first.st_ino,first.st_dev,first.st_size,first.st_mtime_ns)==(last.st_ino,last.st_dev,last.st_size,last.st_mtime_ns),'Module changed while reading')
    need(hashlib.sha256(data).hexdigest()==record['sha256'],'Current public module SHA differs')
    elf=parse_elf(data)
    if record.get('buildIds'):need(sorted(set(record['buildIds']))==elf['buildIds'],'Current ELF build-ID differs')
    return elf,len(data)

def run(input_path,output_path):
    started=time.monotonic();deadline=started+LIMITS['seconds'];input_path=pathlib.Path(input_path);output_path=pathlib.Path(output_path)
    need(input_path.stat().st_size<=LIMITS['inputBytes'],'Offline input byte cap exceeded')
    data=json.loads(input_path.read_text(encoding='utf-8'));profile=data['profile'];snapshots=data['snapshots'];requested={};unknown=Counter();rows=[];module_cache={};module_bytes=0
    start=int(profile['startedMonotonicNs']);stop=int(profile['completedMonotonicNs'])
    need(0<start<=stop,'Invalid capture monotonic interval')
    need(len(snapshots)<=16,'Mapping snapshot count exceeded')
    for sample in profile['parsed']['rows']:
        first=max(int(sample['monotonicSecond'])*1000000000,start);last=min((int(sample['monotonicSecond'])+1)*1000000000,stop)
        need(first<=last,'Sample bucket is outside capture interval')
        for frame in sample['frames']:
            if frame is None:unknown['unknown_unwind_frame']+=sample['count'];continue
            item=requested.setdefault(frame,{'weight':0,'first':first,'last':last});item['weight']+=sample['count'];item['first']=min(item['first'],first);item['last']=max(item['last'],last)
    work=sorted(requested.items(),key=lambda item:(-item[1]['weight'],item[0]));capped=len(work)>LIMITS['uniqueAddresses'];work=work[:LIMITS['uniqueAddresses']]
    result={'status':'in_progress','complete':False,'limits':LIMITS,'requestedUniqueAddresses':len(requested),'addressCapReached':capped,'rows':rows,'unknownReasons':{},'rawUserStackBytes':False,'externalSymbolsDownloaded':False,'processMemoryRead':False,'guestHostCausalClockCalibration':False,'lifetimeMappingCoverageProven':False,'nativeAcceptance':False,'releaseAcceptance':False}
    def persist(status):
        result.update(status=status,elapsedMs=(time.monotonic()-started)*1000,moduleBytesRead=module_bytes,unknownReasons=dict(unknown),addressesProcessed=len(rows),complete=status=='completed' and not capped)
        resolved=[r for r in rows if r.get('symbol')]
        result.update(addressesWithDeclaredFunctions=len(resolved),weightedFramesWithDeclaredFunctions=sum(r['weightedFrameOccurrences'] for r in resolved),functionAttributionAvailability='partial' if resolved else 'unavailable')
        temporary=output_path.with_suffix('.partial');temporary.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');os.replace(temporary,output_path)
    persist('in_progress')
    for address,item in work:
        if time.monotonic()>=deadline:unknown['deadline_unprocessed_addresses']+=len(work)-len(rows);persist('deadline');break
        row={'address':address,'weightedFrameOccurrences':item['weight'],'module':None,'symbol':None,'unknownReason':None}
        try:
            pc=int(address,16);mapping,record=choose_mapping(pc,item['first'],item['last'],snapshots);key=(record['resolved'],record['sha256'],record['device'],record['inode'])
            if key not in module_cache:
                elf,count=verify_public_module(record,LIMITS['moduleBytes']-module_bytes);module_bytes+=count;module_cache[key]=elf
            elf=module_cache[key];offset=pc-int(mapping['start'],16)+int(mapping['fileOffset'],16);virtual=elf_address(offset,elf)
            row.update(module=record['resolved'],sha256=record['sha256'],device=record['device'],inode=record['inode'],buildIds=elf['buildIds'],fileOffset=hex(offset),elfVirtualAddress=hex(virtual),mappingEvidence='consistent bracketing snapshots; unobserved unload/reload not ruled out',symbol=symbol_at(virtual,elf))
            if row['symbol'] is None:row['unknownReason']='No declared FUNC/IFUNC range; stripped/missing symbols or padding'
        except Exception as error:row['unknownReason']=str(error)
        if row['unknownReason']:unknown[row['unknownReason']]+=1
        rows.append(row)
        if len(rows)%64==0:persist('in_progress')
    else:persist('completed')
    print(json.dumps({k:result[k] for k in ['status','complete','requestedUniqueAddresses','addressesProcessed','addressCapReached','moduleBytesRead','elapsedMs','unknownReasons']}))
    return 0 if result['complete'] else 1

if __name__=='__main__':
    try:
        need(len(sys.argv)==3,'Expected input and output paths');sys.exit(run(sys.argv[1],sys.argv[2]))
    except Exception as error:
        print(json.dumps({'complete':False,'error':str(error),'type':type(error).__name__}),file=sys.stderr);sys.exit(1)
