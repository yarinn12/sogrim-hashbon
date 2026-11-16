import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {nativeDestination,NATIVE_AUTH_PATH,NATIVE_PUBLIC_HOST,nativePublicOrigin} from '../src/domain/nativeDeepLinks.mjs';
import {claimNativeAuthCallback} from '../src/domain/nativeAuthCallbacks.mjs';
import {ACCOUNT_OAUTH_FLOW_QUERY_PARAM,ACCOUNT_RECOVERY_FLOW_PURPOSE,saveAccountOAuthFlow,loadAccountOAuthFlow,clearAccountOAuthFlow} from '../src/data/accountAuth.mjs';

const source=(await readFile('src/publicNativeBridgeLayer.mjs','utf8')).replaceAll('\r\n','\n').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'');
const accountSource=(await readFile('src/publicAccountAuthLayer.mjs','utf8')).replaceAll('\r\n','\n');
const setupStart=accountSource.indexOf('async function setupAccountAuth(');
const setupEnd=accountSource.indexOf('\n}\n',setupStart)+2;
assert.ok(setupStart>=0&&setupEnd>setupStart);
const setupAccountAuthSource=accountSource.slice(setupStart,setupEnd);
const origin='https://sogrim-hesbon-app.vercel.app';
const flowId='fixture-apple-callback-flow-20261006';
function storage() {const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
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
  return {listeners,reloads,navigations,location,browserCalls,native:context.SogrimNative,context};
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

for(const order of ['custom-first','completion-first']) {
  test(`a custom App URL ${order} cannot consume the active Apple flow before one HTTPS completion`,async()=>{
    const sessionStorage=storage();
    const flowStorage=storage();
    const verifier='v'.repeat(43);
    assert.ok(saveAccountOAuthFlow({id:flowId,verifier,returnPath:'/'},flowStorage));
    const callback=`${origin}/auth/callback?code=single-use-session-code&auth_flow=${flowId}`;
    const custom=`com.sogrimhashbon.app://auth/callback?code=single-use-session-code&auth_flow=${flowId}`;
    const authorization=new URL('https://fixture.supabase.co/auth/v1/authorize');
    authorization.searchParams.set('provider','apple');
    authorization.searchParams.set('code_challenge_method','s256');
    authorization.searchParams.set('code_challenge','c'.repeat(43));
    authorization.searchParams.set('redirect_to',`${origin}/auth/callback?auth_flow=${flowId}`);
    let finishSession;
    const result=new Promise(resolve=>{finishSession=resolve;});
    const first=await page({sessionStorage,authSession:{open:()=>result}});
    const pending=first.native.openAuth(authorization.href);
    const customEvent=async()=>{
      first.listeners.appUrlOpen({url:custom});
      for(let i=0;i<8;i++)await Promise.resolve();
      assert.equal(first.reloads.length,order==='completion-first'?1:0);
      assert.equal(first.navigations.length,0,'the generic link handler must not navigate to the custom scheme');
      if(order==='custom-first')assert.equal(sessionStorage.values.size,0,'the custom URL must not claim the flow before OS completion');
      assert.equal(loadAccountOAuthFlow(flowId,flowStorage)?.verifier,verifier,'the generic URL must not consume the PKCE flow');
    };
    if(order==='custom-first')await customEvent();
    finishSession({url:callback});
    assert.equal(await pending,true);
    if(order==='completion-first')await customEvent();
    first.listeners.appUrlOpen({url:callback});
    for(let i=0;i<8;i++)await Promise.resolve();
    assert.equal(first.reloads.length,1,'the bound HTTPS callback must reload the account page once');
    assert.deepEqual(first.browserCalls,[]);

    let exchanges=0,connections=0;
    Object.assign(first.context,{
      runtimeConfig:null,accountSession:null,accountSignInPending:false,
      ACCOUNT_OAUTH_FLOW_QUERY_PARAM,ACCOUNT_RECOVERY_FLOW_PURPOSE,
      loadRuntimeConfig:async()=>({storage:{mode:'supabase'}}),runtimeConfigUsesFallback:()=>false,
      loadAccountOAuthFlow:id=>loadAccountOAuthFlow(id,flowStorage),
      clearAccountOAuthFlow:id=>clearAccountOAuthFlow(id,flowStorage),
      authCallbackType:()=>'',sessionFromOAuthHash:()=>null,
      oauthPkceVerifier:()=>'',clearOAuthPkceVerifier:()=>{},
      exchangeOAuthCode:async(_config,code,boundVerifier)=>{
        exchanges++;
        assert.equal(code,'single-use-session-code');
        assert.equal(boundVerifier,verifier);
        return {access_token:'synthetic-access',user:{id:'synthetic-account'}};
      },
      loadStoredAccountSession:()=>null,
      cleanAuthHash:()=>{first.location.href=new URL('/',first.location.href).href;},
      parseInviteEventId:()=>null,pendingInviteUrl:()=>'',
      restoreAccountSession:async session=>session,loadAccountRecoverySession:()=>false,
      scheduleAccountSessionRefresh:()=>{},
      connectAccountToApp:async(session,{forceReload})=>{
        connections++;
        assert.equal(session.user.id,'synthetic-account');
        assert.equal(forceReload,true);
      },
      watchAccountControls:()=>{},enhanceAccountControls:()=>{}
    });
    vm.runInContext(setupAccountAuthSource,first.context);
    await vm.runInContext('setupAccountAuth()',first.context);
    assert.equal(exchanges,1,'the original page must exchange the bound code once');
    assert.equal(connections,1,'the account must connect once');
    assert.equal(first.context.accountSession?.user?.id,'synthetic-account');
    assert.equal(loadAccountOAuthFlow(flowId,flowStorage),null,'the spent flow must be cleared');
    first.listeners.appUrlOpen({url:custom});
    first.listeners.appUrlOpen({url:callback});
    for(let i=0;i<8;i++)await Promise.resolve();
    assert.equal(first.reloads.length,1,'late duplicate callbacks must not reopen the completed flow');
    assert.equal(first.navigations.length,0);
    assert.equal(exchanges,1);
    assert.equal(connections,1);
  });
}

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
