import assert from 'node:assert/strict';

// argv[0] is presentation text: ADB uses "adb" for its fork-server process.
// The kernel executable link, owned socket, PID/start ticks and full cmdline
// together identify the exact SDK server without resolving argv against cwd.
export function inspectAdbOwnerProcess(pid,sdkPath,{identityFor,readFile,realpath},expected) {
  assert.ok(Number.isSafeInteger(pid)&&pid>1,'Require explicit ADB server PID');
  const identity=identityFor(pid);
  assert.equal(identity.pid,pid);
  if(expected)assert.deepEqual(identity,expected.identity,'ADB PID reused or process identity changed');
  const command=readFile('/proc/'+pid+'/cmdline','utf8').split('\0').filter(Boolean);
  const executable=realpath('/proc/'+pid+'/exe');
  assert.equal(executable,realpath(sdkPath),'ADB server is not the exact SDK executable');
  assert.ok(command.includes('tcp:5037')&&command.includes('fork-server')&&command.includes('server'),'ADB server command does not own the reviewed socket role');
  if(expected){
    assert.equal(pid,expected.pid);
    assert.deepEqual(command,expected.command,'ADB command identity changed');
    assert.equal(executable,expected.executable,'ADB executable identity changed');
  }
  return {pid,identity,command,executable};
}
