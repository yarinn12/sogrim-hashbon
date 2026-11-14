import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

test('custom native auth probe returns through this candidate server with the bound code and no public-site dependency',async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url));
  const keep=['PATH','SystemRoot','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE'];
  const env=Object.fromEntries(keep.filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{PROBE_MODE:'custom',SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1'});
  const child=spawn(process.execPath,['scripts/qa/native-auth-session/native-auth-session-server.mjs',root],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const closed=once(child,'close');
  let output='';child.stderr.on('data',chunk=>{output+=chunk;});
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Owned probe server was not ready: '+output)),4000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error('Owned probe server exited before ready: '+code+' '+output));});
      child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('PROBE_HTTP_READY')){clearTimeout(timer);resolve();}});
    });
    const flow='fixture-bound-flow-20261112-qa513';
    const callback=new URL('https://sogrim-hesbon-app.vercel.app/auth/callback');
    callback.searchParams.set('auth_flow',flow);callback.searchParams.set('native_auth_session','1');
    const start=new URL('http://127.0.0.1:8765/start');start.searchParams.set('redirect_to',callback.href);
    const provider=await fetch(start,{redirect:'manual'});assert.equal(provider.status,302);
    const local=new URL(provider.headers.get('location'));
    assert.equal(local.origin,'http://127.0.0.1:8765','custom fixture must stay on its loopback candidate, not the deployed public website');
    assert.equal(local.pathname,'/auth/callback');
    assert.equal(local.searchParams.get('auth_flow'),flow);
    assert.equal(local.searchParams.get('code'),'fixture-system-session-code');
    assert.equal(local.searchParams.get('native_auth_session'),'1');
    // Exercise the actual product HTTP handler. Do not construct an OS callback
    // in the fixture or supply a verifier/token that the app did not create.
    const returned=await fetch(local,{redirect:'manual'});assert.equal(returned.status,302);
    const native=new URL(returned.headers.get('location'));
    assert.equal(native.protocol,'com.sogrimhashbon.app:');assert.equal(native.hostname,'auth');assert.equal(native.pathname,'/callback');
    assert.deepEqual([...native.searchParams.entries()],[['auth_flow',flow],['code','fixture-system-session-code']]);
    assert.equal(returned.headers.get('cache-control'),'no-store, max-age=0');
    assert.equal(returned.headers.get('referrer-policy'),'no-referrer');
    local.searchParams.append('auth_flow',flow);
    const rejected=await fetch(local,{redirect:'manual'});assert.equal(rejected.status,400);assert.equal(rejected.headers.get('location'),null);
  } finally {
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
    await closed;
  }
});
