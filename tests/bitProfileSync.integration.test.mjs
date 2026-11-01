import assert from 'node:assert/strict';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {createBitProfileDatabase,BIT_USERS,BIT_LINKS,BIT_SNAPSHOT,bitTransferTo} from './helpers/bitProfileDatabase.mjs';
import {loadOwnBitProfile,saveOwnBitProfile,loadTransferBitProfile} from '../src/data/bitProfileStore.mjs';

let fixture;
before(async()=>{fixture=await createBitProfileDatabase();},{timeout:60000});
after(async()=>fixture?.close());
beforeEach(async()=>fixture.begin());afterEach(async()=>fixture.rollback());

test('two receiving accounts persist different QR links; an independent payer resolves the canonical recipient',async()=>{
  const a=fixture.config(0),b=fixture.config(1),payer=fixture.config(2);
  assert.equal((await loadOwnBitProfile(a)).revision,0);
  await saveOwnBitProfile(a,{url:BIT_LINKS[0],expectedRevision:0});
  await saveOwnBitProfile(b,{url:BIT_LINKS[1],expectedRevision:0});
  for(const index of [0,1]){
    const result=await loadTransferBitProfile(payer,{snapshotId:BIT_SNAPSHOT,transferId:bitTransferTo(index)});
    assert.equal(result.profile.url,BIT_LINKS[index]);assert.equal(result.recipientUserId,BIT_USERS[index]);
    assert.equal(result.amountMinor,5000);assert.equal(result.currency,'ILS');
  }
  assert.equal((await loadOwnBitProfile(fixture.config(0))).url,BIT_LINKS[0],'a new client reads the committed cloud row');
  const write=fixture.calls.find(c=>c.name==='set_my_bit_shortcut');
  assert.deepEqual(Object.keys(write.body).sort(),['p_bit_url','p_expected_revision']);
});

test('replacement and removal reach another client, and stale concurrent writes cannot resurrect a removed QR',async()=>{
  const first=fixture.config(0),second=fixture.config(0),payer=fixture.config(2);
  await saveOwnBitProfile(first,{url:BIT_LINKS[0],expectedRevision:0});
  const stale=await loadOwnBitProfile(second);
  await saveOwnBitProfile(first,{url:BIT_LINKS[2],expectedRevision:1});
  assert.equal((await loadOwnBitProfile(second)).url,BIT_LINKS[2]);
  await saveOwnBitProfile(first,{url:null,expectedRevision:2});
  await assert.rejects(saveOwnBitProfile(second,{url:stale.url,expectedRevision:stale.revision}),{code:'BIT_CONFLICT'});
  assert.equal((await loadOwnBitProfile(second)).url,null);
  assert.equal((await loadTransferBitProfile(payer,{snapshotId:BIT_SNAPSHOT,transferId:bitTransferTo(0)})).profile.url,null);
  const concurrent=await Promise.allSettled([saveOwnBitProfile(first,{url:BIT_LINKS[0],expectedRevision:3}),saveOwnBitProfile(second,{url:BIT_LINKS[1],expectedRevision:3})]);
  assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(concurrent.find(x=>x.status==='rejected').reason.code,'BIT_CONFLICT');
});

test('stale profile writes use a non-retryable HTTP conflict and preserve the complete saved row',async()=>{
  await fixture.as(BIT_USERS[0],db=>db.query('select public.set_my_bit_shortcut($1,0)',[BIT_LINKS[0]]));
  const before=await fixture.db.query('select * from private.user_bit_shortcuts where user_id=$1::uuid',[BIT_USERS[0]]);
  await assert.rejects(fixture.as(BIT_USERS[0],db=>db.query('select public.set_my_bit_shortcut($1,0)',[BIT_LINKS[1]])),{code:'PT409'});
  assert.deepEqual((await fixture.db.query('select * from private.user_bit_shortcuts where user_id=$1::uuid',[BIT_USERS[0]])).rows,before.rows);
});

test('authentication, direct-table privileges, payer scope, membership and blocks are enforced by SQL',async()=>{
  await saveOwnBitProfile(fixture.config(0),{url:BIT_LINKS[0],expectedRevision:0});
  await assert.rejects(fixture.as(null,db=>db.query('select public.get_my_bit_shortcut()')),{code:'42501'});
  await assert.rejects(fixture.as(null,db=>db.query('select public.get_my_bit_shortcut()'),'anon'),{code:'42501'});
  await assert.rejects(fixture.as(BIT_USERS[1],db=>db.query('select * from private.user_bit_shortcuts')),{code:'42501'});
  await assert.rejects(fixture.as(BIT_USERS[1],db=>db.query('update private.user_bit_shortcuts set bit_url=null where user_id=$1::uuid',[BIT_USERS[0]])),{code:'42501'});
  for(const actor of [0,1,4])await assert.rejects(loadTransferBitProfile(fixture.config(actor),{snapshotId:BIT_SNAPSHOT,transferId:bitTransferTo(0)}),{code:'BIT_FORBIDDEN'});
  await fixture.db.query("update private.shared_snapshot_members set status='removed',removed_at=now() where snapshot_id=$1 and user_id=$2::uuid",[BIT_SNAPSHOT,BIT_USERS[2]]);
  await assert.rejects(loadTransferBitProfile(fixture.config(2),{snapshotId:BIT_SNAPSHOT,transferId:bitTransferTo(0)}),{code:'BIT_FORBIDDEN'});
  await fixture.db.query("update private.shared_snapshot_members set status='active',removed_at=null where snapshot_id=$1 and user_id=$2::uuid",[BIT_SNAPSHOT,BIT_USERS[2]]);
  await fixture.db.query("insert into public.user_blocks(blocker_user_id,blocked_user_id,blocked_display_name) values($1::uuid,$2::uuid,'Synthetic User')",[BIT_USERS[0],BIT_USERS[2]]);
  await assert.rejects(loadTransferBitProfile(fixture.config(2),{snapshotId:BIT_SNAPSHOT,transferId:bitTransferTo(0)}),{code:'BIT_FORBIDDEN'});
});

test('database validation rejects unsafe QR URLs and does not overwrite the existing shortcut',async()=>{
  await saveOwnBitProfile(fixture.config(0),{url:BIT_LINKS[0],expectedRevision:0});
  for(const value of ['https://evil.invalid/app/me/'+ 'a'.repeat(30),BIT_LINKS[0]+'?amount=1','javascript:alert(1)','',BIT_LINKS[0]+'#x']){
    await assert.rejects(fixture.as(BIT_USERS[0],db=>db.query('select public.set_my_bit_shortcut($1,1)',[value])),{code:'22023'});
  }
  assert.equal((await loadOwnBitProfile(fixture.config(0))).url,BIT_LINKS[0]);
});

test('QR edits leave identity and canonical financial snapshots untouched',async()=>{
  const before=await fixture.db.query('select state from public.app_snapshots order by id');
  const profile=await fixture.db.query('select display_name,avatar_image,username,updated_at from public.user_profiles where user_id=$1::uuid',[BIT_USERS[0]]);
  await saveOwnBitProfile(fixture.config(0),{url:BIT_LINKS[0],expectedRevision:0});
  await saveOwnBitProfile(fixture.config(0),{url:null,expectedRevision:1});
  assert.deepEqual((await fixture.db.query('select state from public.app_snapshots order by id')).rows,before.rows);
  assert.deepEqual((await fixture.db.query('select display_name,avatar_image,username,updated_at from public.user_profiles where user_id=$1::uuid',[BIT_USERS[0]])).rows,profile.rows);
});

test('service data deletion and Auth account deletion both remove the receiving shortcut',async()=>{
  // The service-only standalone path uses an account without shared records.
  // Shared-account cleanup must run through the existing Auth deletion trigger,
  // whose nested ownership guards intentionally reject a direct foreign rewrite.
  await saveOwnBitProfile(fixture.config(4),{url:BIT_LINKS[0],expectedRevision:0});
  await fixture.db.query("select set_config('request.jwt.claim.role','service_role',true)");
  await fixture.db.query("select set_config('request.jwt.claim.sub','',true)");
  await fixture.db.query('select public.delete_account_data($1::uuid)',[BIT_USERS[4]]);
  assert.equal((await fixture.db.query('select count(*)::int as n from private.user_bit_shortcuts where user_id=$1::uuid',[BIT_USERS[4]])).rows[0].n,0);
  await saveOwnBitProfile(fixture.config(0),{url:BIT_LINKS[1],expectedRevision:0});
  await fixture.db.query("select set_config('request.jwt.claim.role','service_role',true)");
  await fixture.db.query("select set_config('request.jwt.claim.sub','',true)");
  await fixture.db.query('delete from auth.users where id=$1::uuid',[BIT_USERS[0]]);
  assert.equal((await fixture.db.query('select count(*)::int as n from private.user_bit_shortcuts where user_id=$1::uuid',[BIT_USERS[0]])).rows[0].n,0);
});

test('an existing schema can be upgraded, and optional profiles start empty',async()=>{
  const upgraded=await createBitProfileDatabase({upgrade:true});
  try{await upgraded.begin();assert.equal((await loadOwnBitProfile(upgraded.config(0))).url,null);}
  finally{await upgraded.rollback();await upgraded.close();}
});
