import assert from 'node:assert/strict';

const identity=value=>({path:value.path,canonicalPath:value.canonicalPath,character:value.character,
  dev:value.dev,ino:value.ino,rdev:value.rdev});
function requireDevice(value){
  assert.equal(value.path,'/dev/kvm');assert.equal(value.canonicalPath,'/dev/kvm','Refuse redirected KVM device');
  assert.equal(value.character,true,'Require actual KVM character device');
  for(const key of ['dev','ino','rdev'])assert.ok(Number.isSafeInteger(value[key])&&value[key]>=0,'Missing KVM device identity');
  assert.equal(typeof value.accessible,'boolean');assert.equal(typeof value.acl,'string');
}
// Reproduce the original workflow's narrowly scoped setup immediately before
// each launch. Observations and the current numeric CI uid are retained; no
// groups, udev rules, SDK flags or other host permissions are changed.
export async function prepareOwnedKvm({uid,observe,grant,checkAcceleration,priorDevice,onRecord=()=>{}}){
  assert.ok(Number.isSafeInteger(uid)&&uid>0,'Require the current non-root CI uid');
  const report={uid,stages:[]};
  const record=(stage,value)=>{report.stages.push({stage,...value});onRecord(structuredClone(report));};
  report.before=await observe();requireDevice(report.before);record('before',report.before);
  if(priorDevice)assert.deepEqual(identity(report.before),identity(priorDevice),'KVM device changed between arms');
  await grant(uid);
  report.after=await observe();requireDevice(report.after);record('after',report.after);
  assert.deepEqual(identity(report.after),identity(report.before),'KVM device changed during access setup');
  assert.equal(report.after.accessible,true,'KVM read/write access remains unavailable');
  report.acceleration=await checkAcceleration();record('acceleration',{proof:report.acceleration});
  assert.match(report.acceleration,/KVM \(version 12\) is installed and usable\./,'Require the same actual KVM accelerator before either launch');
  report.ready=true;onRecord(structuredClone(report));return report;
}
