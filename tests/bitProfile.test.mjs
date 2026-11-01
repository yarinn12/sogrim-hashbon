import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeBitReceivingUrl,normalizeBitProfile,validateBitQrFile} from '../src/domain/bitProfile.mjs';
import {createQrMatrix} from '../src/domain/qrCode.mjs';
import {bitProfileAvailable,saveOwnBitProfile} from '../src/data/bitProfileStore.mjs';
import {createBitProfileController} from '../src/bitProfileController.mjs';
import {renderBitProfileView} from '../src/ui/bitProfilePresentation.mjs';
import {getRuntimeConfig,getClientRuntimeConfig} from '../src/server/runtimeConfig.mjs';

const ID='00000000-0000-4000-8000-000000000710';
const URL='https://www.bitpay.co.il/app/me/11111111-1111-1111-1111-111111111111';
const OTHER=URL.replaceAll('1','2');
const config=()=>({features:{bitQrProfile:true},storage:{mode:'supabase',url:'https://synthetic.invalid',anonKey:'synthetic',account:{userId:ID,accessToken:'synthetic'}}});
const profile=(url=null,revision=0)=>({userId:ID,url,revision,updatedAt:revision?'2026-11-01T12:00:00Z':null});
const wire=(url=null,revision=0)=>({user_id:ID,bit_url:url,revision,updated_at:revision?'2026-11-01T12:00:00Z':null});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(options={}){
  let current=config(),scope='owner-a';
  const writes=[];
  const controller=createBitProfileController({getConfig:()=>current,getScope:()=>scope,
    load:async()=>profile(),save:async(_config,value)=>{writes.push(value);return profile(value.url,value.expectedRevision+1);},
    readImage:()=>({promise:Promise.resolve(URL),cancel(){}}),...options});
  return {controller,writes,switchAccount(){scope='owner-b';current={...config(),storage:{...config().storage,account:{userId:ID.replace('710','711'),accessToken:'other'}}};},signOut(){current={storage:{mode:'local'}};}};
}

test('the rollout flag defaults off and requires an authenticated cloud account',()=>{
  assert.equal(getRuntimeConfig({}).features.bitQrProfile,false);
  assert.equal(getClientRuntimeConfig(getRuntimeConfig({BIT_QR_PROFILE_ENABLED:'true'})).features.bitQrProfile,true);
  assert.equal(bitProfileAvailable(config()),true);
  for(const changed of [{features:{bitQrProfile:false}},{storage:{mode:'local'}},{storage:{...config().storage,account:{userId:ID}}}])assert.equal(bitProfileAvailable({...config(),...changed}),false);
});
test('only exact personal receiving QR URLs are accepted',()=>{
  assert.equal(normalizeBitReceivingUrl(URL),URL);
  for(const bad of [URL+'?amount=1',URL+'#x',URL+'\n',URL.replace('www.bitpay.co.il','www.bitpay.co.il.evil.invalid'),URL.replace('https:','http:'),URL.replace('www.','user@www.'),URL.replace('.il/','.il:443/'),'bit://app/me/test',null])assert.throws(()=>normalizeBitReceivingUrl(bad));
  assert.throws(()=>validateBitQrFile({type:'image/svg+xml',size:100}));
  assert.throws(()=>validateBitQrFile({type:'image/png',size:13*1024*1024}));
  assert.throws(()=>validateBitQrFile({type:'image/png',size:0}));
});
test('wrong-owner, malformed and mismatched cloud acknowledgements cannot announce success',async()=>{
  for(const value of [{...wire(URL,1),user_id:'someone-else'},wire(OTHER,1),wire(URL,3),{...wire(URL,1),revision:'1'}]){
    await assert.rejects(saveOwnBitProfile(config(),{url:URL,expectedRevision:0},async()=>new Response(JSON.stringify(value))),error=>['BIT_ACK','BIT_QR_URL'].includes(error.code));
  }
  assert.throws(()=>normalizeBitProfile({...wire(null,1),updated_at:null},ID));
});
test('selecting a QR does not save it; only explicit save uses the loaded revision',async()=>{
  const h=harness();await h.controller.refresh();await h.controller.choose({});
  assert.equal(h.writes.length,0);assert.equal(h.controller.state().draft,URL);
  await h.controller.save();assert.deepEqual(h.writes,[{url:URL,expectedRevision:0}]);
  assert.equal(h.controller.state().draft,undefined);assert.match(h.controller.state().notice,/נשמר בחשבון/);
  await h.controller.remove();assert.deepEqual(h.writes[1],{url:null,expectedRevision:1});
});
test('a cancelled picker or bad image does not change the saved cloud link',async()=>{
  const h=harness({load:async()=>profile(OTHER,4),readImage:()=>({promise:Promise.reject({code:'BIT_QR_NOT_FOUND'}),cancel(){}})});
  await h.controller.refresh();await h.controller.choose(async()=>null);
  assert.equal(h.controller.state().profile.url,OTHER);assert.equal(h.controller.state().error,'');
  await h.controller.choose({});assert.equal(h.controller.state().profile.url,OTHER);assert.equal(h.writes.length,0);
  assert.match(h.controller.state().error,/לא מצאנו QR/);
});
test('account switching during a native picker cannot attach its result to the new account',async()=>{
  const gate=deferred(),h=harness();await h.controller.refresh();
  const choose=h.controller.choose(()=>gate.promise);h.switchAccount();gate.resolve({});await choose;
  assert.equal(h.controller.state().draft,undefined);assert.equal(h.controller.state().profile,null);
  assert.equal(h.writes.length,0);
});
test('late decoding and cloud saves cannot publish success after sign-out or a route exit',async()=>{
  const image=deferred(),h=harness({readImage:()=>({promise:image.promise,cancel(){}})});
  await h.controller.refresh();const reading=h.controller.choose({});await tick();h.signOut();image.resolve(URL);await reading;
  assert.equal(h.controller.state().enabled,false);assert.equal(h.controller.state().notice,'');
  const saved=deferred(),s=harness({save:()=>saved.promise});await s.controller.refresh();await s.controller.choose({});
  const saving=s.controller.save();s.controller.leave();saved.resolve(profile(URL,1));await saving;
  assert.equal(s.controller.state().notice,'');assert.equal(s.controller.state().profile,null);
});
test('a conflict or uncertain save requires a canonical reload before another write',async()=>{
  let writes=0,loads=0;
  const h=harness({load:async()=>profile(loads++?OTHER:null,loads>1?2:0),save:async()=>{writes++;throw {code:'BIT_CONFLICT'};}});
  await h.controller.refresh();await h.controller.choose({});await h.controller.save();await h.controller.save();
  assert.equal(writes,1);assert.equal(h.controller.state().needsReload,true);assert.match(h.controller.state().error,/מכשיר אחר/);
  await h.controller.refresh();assert.equal(h.controller.state().profile.url,OTHER);assert.equal(h.controller.state().draft,undefined);
});
test('profile presentation remains optional, accessible, escaped and does not expose the receiving URL',()=>{
  assert.equal(renderBitProfileView({enabled:false}),'');
  const html=renderBitProfileView({enabled:true,profile:profile(URL,1),busy:'',error:'<script>',notice:'',draft:undefined});
  assert.match(html,/לא חובה/);assert.match(html,/aria-live="polite"/);assert.match(html,/הסר את קיצור Bit/);
  assert.match(html,/&lt;script&gt;/);assert.equal(html.includes(URL),false);assert.equal(/required/.test(html),false);
});
test('the bundled decoder reads an independently generated synthetic receiving QR',()=>{
  const module={exports:{}};
  vm.runInNewContext(readFileSync(new globalThis.URL('../assets/bit/vendor/jsQR.js',import.meta.url),'utf8'),{module,exports:module.exports,Uint8ClampedArray});
  const matrix=createQrMatrix(URL).modules,scale=6,pad=4,size=(matrix.length+pad*2)*scale;
  const pixels=new Uint8ClampedArray(size*size*4);pixels.fill(255);
  for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x]){
    for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++){
      const p=(((y+pad)*scale+yy)*size+(x+pad)*scale+xx)*4;pixels[p]=pixels[p+1]=pixels[p+2]=0;
    }
  }
  assert.equal(module.exports(pixels,size,size,{inversionAttempts:'attemptBoth'}).data,URL);
});
