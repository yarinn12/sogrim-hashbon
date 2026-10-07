import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createAppHandler} from '../server.mjs';
import {nativeAuthReturn} from '../src/server/nativeAuthReturn.mjs';

test('the HTTPS Apple callback returns a bound code to the OS auth session instead of a separate web login',async()=>{
  const logs=[];
  const server=createServer(createAppHandler({root:process.cwd(),env:{},port:0,serverRequestLogger:value=>logs.push(value)}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const flow='fixture-native-auth-flow-20261007';
    const response=await fetch(`${base}/auth/callback?native_auth_session=1&auth_flow=${flow}&code=synthetic-single-use-code`,{redirect:'manual'});
    assert.equal(response.status,302,'the native session must receive a redirect, not an HTML page without its verifier');
    const destination=new URL(response.headers.get('location'));
    assert.equal(destination.protocol,'com.sogrimhashbon.app:');
    assert.equal(destination.hostname,'auth');
    assert.equal(destination.pathname,'/callback');
    assert.equal(destination.searchParams.get('auth_flow'),flow);
    assert.equal(destination.searchParams.get('code'),'synthetic-single-use-code');
    assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert(!JSON.stringify(logs).includes('synthetic-single-use-code'));
    const web=await fetch(`${base}/auth/callback?auth_flow=${flow}&code=synthetic-web-code`,{redirect:'manual'});
    assert.equal(web.status,200,'email and ordinary web callbacks must still load the app');
    assert.match(await web.text(),/<html/);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
  }
});

test('native return accepts provider rejection and never forwards secrets or an arbitrary destination',()=>{
  const flow='fixture-native-auth-flow-20261007';
  const result=nativeAuthReturn(new URL(`https://app.example/auth/callback?native_auth_session=1&auth_flow=${flow}&error=access_denied&error_description=private&access_token=secret&redirect_to=https://attacker.example`));
  assert.equal(result.status,302);
  assert.equal(result.location,`com.sogrimhashbon.app://auth/callback?auth_flow=${flow}&error=access_denied`);
  for(const query of [
    `native_auth_session=1&auth_flow=${flow}&code=a&error=b`,
    `native_auth_session=1&auth_flow=${flow}&code=a&code=b`,
    `native_auth_session=1&auth_flow=${flow}&error=`,
    `native_auth_session=1&auth_flow=short&code=a`,
    `native_auth_session=1&auth_flow=${flow}&auth_flow=${flow}&code=a`,
    `native_auth_session=1&auth_flow=${flow}&code=%0d%0aLocation:evil`,
    `native_auth_session=2&auth_flow=${flow}&code=a`
  ])assert.deepEqual(nativeAuthReturn(new URL('https://app.example/auth/callback?'+query)),{status:400,location:''});
  assert.equal(nativeAuthReturn(new URL('https://app.example/auth/callback?code=email-code')),null);
});
