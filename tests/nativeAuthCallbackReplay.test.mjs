import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {nativeDestination,NATIVE_AUTH_PATH,NATIVE_PUBLIC_HOST,nativePublicOrigin} from '../src/domain/nativeDeepLinks.mjs';
import {claimNativeAuthCallback} from '../src/domain/nativeAuthCallbacks.mjs';

const source=(await readFile('src/publicNativeBridgeLayer.mjs','utf8')).replaceAll('\r\n','\n').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'');
const origin='https://sogrim-hesbon-app.vercel.app';
const flowId='fixture-apple-callback-flow-20261006';
function storage() {const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
async function page({sessionStorage,launchUrl=null,currentUrl='capacitor://localhost',authSession=null}) {
  const listeners={};
  const reloads=[];
  const navigations=[];
  const browserCalls=[];
  const location=new URL(currentUrl);
  location.reload=()=>reloads.push(location.href);
  location.replace=value=>navigations.push(value);
  const context=vm.createContext({
    URL,URLSearchParams,Promise,Date,console,CustomEvent,
    sessionStorage,
    claimNativeAuthCallback:value=>claimNativeAuthCallback(value,sessionStorage),
    NATIVE_AUTH_PATH,NATIVE_PUBLIC_HOST,nativePublicOrigin,nativeDestination,
    document:{documentElement:{classList:{add(){}}},addEventListener(){},dispatchEvent(){return true;}},
    window:{location,dispatchEvent(){return true;}},
    history:{state:null,replaceState(_state,_title,destination){location.href=new URL(destination,location.href).href;}},
    Capacitor:{isNativePlatform:()=>true,getPlatform:()=>'ios',Plugins:{
      Browser:{close:async()=>{browserCalls.push('close');},open:async()=>{browserCalls.push('open');}},
      ...(authSession ? {SogrimAuthSession:authSession} : {}),
      App:{addListener:async(name,callback)=>{listeners[name]=callback;return {remove(){}};},getLaunchUrl:async()=>launchUrl?{url:launchUrl}:null}
    }}
  });
  vm.runInContext(source,context);
  for(let i=0;i<16;i++)await Promise.resolve();
  return {listeners,reloads,navigations,location,browserCalls,native:context.SogrimNative};
}

test('Apple authentication session returns its bound code to the original app without a Safari page or Browser.close',async()=>{
  const callback=`${origin}/auth/callback?code=single-use-session-code&auth_flow=${flowId}`;
  const authorization=new URL('https://fixture.supabase.co/auth/v1/authorize');
  authorization.searchParams.set('provider','apple');
  authorization.searchParams.set('redirect_to',`${origin}/auth/callback?auth_flow=${flowId}`);
  const opened=[];
  const first=await page({sessionStorage:storage(),authSession:{open:async options=>{opened.push(options.url);return {url:callback};}}});
  assert.equal(await first.native.openAuth(authorization.href),true);
  assert.equal(opened.length,1,'Apple must use the OS authentication session rather than an isolated Safari page');
  assert.equal(first.reloads.length,1,'the completed code must reach the app holding the PKCE verifier');
  assert.match(first.reloads[0],/code=single-use-session-code/);
  assert.deepEqual(first.browserCalls,[],'closing a Browser that was never opened must not delay delivery');
});

for(const query of ['code=single-use-apple-code','error=access_denied']) {
  test(`retained iOS launch URL cannot reload the Apple callback again: ${query.split('=')[0]}`,async()=>{
    const shared=storage();
    const callback=`${origin}/auth/callback?${query}&auth_flow=${flowId}`;
    const first=await page({sessionStorage:shared});
    first.listeners.appUrlOpen({url:callback});
    for(let i=0;i<8;i++)await Promise.resolve();
    assert.equal(first.reloads.length,1,'first callback must reach the account-auth page');
    assert.match(first.reloads[0],/auth_flow=/);
    // The actual iOS App plugin returns ApplicationDelegateProxy.lastURL again
    // after this WebView reload. Existing fixtures incorrectly returned null.
    const afterReload=await page({sessionStorage:shared,launchUrl:callback,currentUrl:first.reloads[0]});
    assert.equal(afterReload.reloads.length,0,'a retained launch URL must not interrupt the code exchange with another reload');
    const afterCleanup=await page({sessionStorage:shared,launchUrl:callback});
    assert.equal(afterCleanup.reloads.length,0,'a consumed callback must not reopen after account-auth cleans its URL');
    const newCallback=callback.replace(flowId,'fixture-new-apple-callback-flow-20261006');
    afterCleanup.listeners.appUrlOpen({url:newCallback});
    for(let i=0;i<8;i++)await Promise.resolve();
    assert.equal(afterCleanup.reloads.length,1,'a fresh login attempt must remain usable');
    assert(!JSON.stringify([...shared.values.values()]).includes('single-use-apple-code'),'deduplication must not persist authorization codes');
  });
}

test('a cancelled Apple OS session can retry, while mismatched or ambiguous callbacks never reach the app',async()=>{
  const authorization=new URL('https://fixture.supabase.co/auth/v1/authorize');
  authorization.searchParams.set('provider','apple');
  authorization.searchParams.set('redirect_to',`${origin}/auth/callback?auth_flow=${flowId}`);
  let result='cancel';
  const first=await page({sessionStorage:storage(),authSession:{open:async()=>{
    if(result==='cancel')throw new Error('Authentication cancelled');
    return {url:result};
  }}});
  await assert.rejects(first.native.openAuth(authorization.href),/cancelled/);
  for(const callback of [
    `${origin}/auth/callback?code=bad&auth_flow=fixture-other-flow-20261007`,
    `${origin}/auth/callback?code=bad&error=denied&auth_flow=${flowId}`,
    `${origin}/auth/callback?code=bad&auth_flow=${flowId}&auth_flow=${flowId}`,
    `https://attacker.example/auth/callback?code=bad&auth_flow=${flowId}`,
    `${origin}/auth/callback?code=bad&auth_flow=${flowId}#access_token=bad`
  ]) {
    result=callback;
    await assert.rejects(first.native.openAuth(authorization.href),/bound callback/);
    assert.equal(first.reloads.length,0);
  }
  result=`${origin}/auth/callback?code=retry&auth_flow=${flowId}`;
  assert.equal(await first.native.openAuth(authorization.href),true);
  assert.equal(first.reloads.length,1);
  assert.deepEqual(first.browserCalls,[]);
});

test('a cold native callback is delivered once and unrelated links retain navigation',async()=>{
  const shared=storage();
  const callback=`${origin}/auth/callback?code=cold-code&auth_flow=${flowId}`;
  const first=await page({sessionStorage:shared,launchUrl:callback});
  assert.equal(first.reloads.length,1);
  const restored=await page({sessionStorage:shared,launchUrl:callback,currentUrl:first.reloads[0]});
  assert.equal(restored.reloads.length,0);
  restored.listeners.appUrlOpen({url:origin+'/?view=profile'});
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.deepEqual(restored.navigations,['./?view=profile']);
});

test('the callback claim delivers unbound input once and stores only bounded opaque IDs or digests',async()=>{
  const shared=storage();
  assert.equal(await claimNativeAuthCallback(origin+'/auth/callback?code=unbound',shared),true);
  assert.equal(await claimNativeAuthCallback(origin+'/auth/callback?code=unbound',shared),false);
  assert.equal(await claimNativeAuthCallback(origin+'/auth/callback?auth_flow=short',shared),true);
  assert.equal(await claimNativeAuthCallback(origin+'/auth/callback?auth_flow=short',shared),false);
  for(let i=0;i<12;i++)assert.equal(await claimNativeAuthCallback(origin+'/auth/callback?auth_flow=fixture-flow-0000000000'+i,shared),true);
  assert.equal(JSON.parse([...shared.values.values()][0]).length,8);
  assert.equal(await claimNativeAuthCallback(origin+'/auth/callback?auth_flow=fixture-flow-000000000011',shared),false);
});
