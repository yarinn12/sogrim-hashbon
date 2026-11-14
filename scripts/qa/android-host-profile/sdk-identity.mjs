import assert from 'node:assert/strict';
export function compareSdkBinaries(baseline,current){
  for(const report of [baseline,current]){
    assert.equal(report?.coverage,'emulator-elf-tree-v1');assert.equal(report.historicalBinaryComparison,false);
    assert.ok(Array.isArray(report.files)&&report.files.length>=3,'Missing SDK binary identity');
    const paths=new Set();
    for(const file of report.files){
      for(const name of [file.path,file.resolvedPath])assert.ok(typeof name==='string'&&name.startsWith('emulator/')&&!name.split('/').includes('..')&&!name.includes('\\'),'Foreign SDK binary path');
      assert.ok(!paths.has(file.path),'Duplicate SDK binary');paths.add(file.path);
      assert.ok(Number.isSafeInteger(file.bytes)&&file.bytes>=4);assert.match(file.sha256||'',/^[a-f0-9]{64}$/);
    }
    for(const path of ['emulator/emulator','emulator/qemu/linux-x86_64/qemu-system-x86_64-headless'])assert.ok(paths.has(path),'Required SDK executable absent');
    assert.ok([...paths].some(p=>p.startsWith('emulator/lib64/')),'SDK libraries absent');
  }
  assert.deepEqual(current.files,baseline.files,'SDK binary identity changed between arm boundaries');
  return {verified:true,files:current.files.length,historicalBinaryComparison:false};
}
