import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,openSync,ftruncateSync,writeSync,closeSync,readFileSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {sha256File} from '../scripts/qa/android-renderer-ab/hash-file.mjs';

function temporary(t) {
  const directory=mkdtempSync(join(tmpdir(),'ab-digest-'));
  const file=join(directory,'sdk-image');
  t.after(()=>{
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));
    try{unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
    rmdirSync(directory);
  });
  return file;
}

test('actual 2421161984-byte SDK image defeats OLD buffered read and hashes completely with FINAL bounded reads',t=>{
  const file=temporary(t),size=2421161984;
  const fd=openSync(file,'wx');
  try {
    ftruncateSync(fd,size);
    writeSync(fd,Buffer.from('SDK'),0,3,0);
    writeSync(fd,Buffer.from('END'),0,3,size-3);
  } finally {closeSync(fd);}
  assert.throws(()=>readFileSync(file),{code:'ERR_FS_FILE_TOO_LARGE'});
  // Independently calculated with Python hashlib over SDK + zero bytes + END.
  assert.equal(sha256File(file),'cbc97b7777af9489443efaf09eeb560700fe1da2091e33c03facee93bc2c83b4');
});

test('bounded hash preserves empty, partial-chunk and binary bytes; missing inputs fail closed',t=>{
  const file=temporary(t);
  for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,1,128]),Buffer.alloc(1024*1024+19,0x7e)]){
    writeFileSync(file,bytes);
    assert.equal(sha256File(file),createHash('sha256').update(bytes).digest('hex'));
  }
  unlinkSync(file);
  assert.throws(()=>sha256File(file),{code:'ENOENT'});
});
