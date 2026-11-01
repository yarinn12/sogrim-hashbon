import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {repaymentModeFixture} from './repaymentModeFixture.mjs';
import {buildSharedEventState} from '../../src/data/sharedEventStore.mjs';

export const BIT_USERS=['a','b','c','d','e'].map((_,i)=>`00000000-0000-4000-8000-${String(i+710).padStart(12,'0')}`);
export const BIT_LINKS=[1,2,3].map(i=>`https://www.bitpay.co.il/app/me/${String(i).repeat(8)}-${String(i).repeat(4)}-${String(i).repeat(4)}-${String(i).repeat(4)}-${String(i).repeat(12)}`);
export const BIT_SNAPSHOT='event-bit-profile-sync';
export const bitTransferTo=index=>`direct-account-${BIT_USERS[2]}-account-${BIT_USERS[index]}`;

// Real PostgreSQL schema and authenticated roles. Only hosted Auth/PostgREST
// transport is simulated; there are no .env reads, real tokens or cloud writes.
export async function createBitProfileDatabase({upgrade=false}={}){
  const db=new PGlite({extensions:{pgcrypto}});
  try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb,
      raw_app_meta_data jsonb default '{}'::jsonb,created_at timestamptz default now(),updated_at timestamptz default now(),
      email_confirmed_at timestamptz,confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'role',auth.role())$$;`);
  const schema=await readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8');
  const migration=await readFile(new URL('../../supabase/migrations/20261101190000_optional_private_bit_profiles.sql',import.meta.url),'utf8');
  await db.exec(upgrade?schema.split('-- Optional private Bit receiving shortcuts (2026-11-01).')[0]:schema);
  await db.exec(migration); // also proves that the migration can be replayed safely
  await db.exec(await readFile(new URL('../../supabase/verification/verify_20261101190000_optional_private_bit_profiles.sql',import.meta.url),'utf8'));
  for(const [i,id] of BIT_USERS.entries()){
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1::uuid,$2,$3::jsonb)',
      [id,`bit-user-${i}@example.invalid`,JSON.stringify({full_name:`Synthetic User ${i}`})]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    await db.query(`insert into public.app_snapshots(id,access_key_hash,owner_user_id,state) values
      ($1,encode(extensions.digest('synthetic-bit-key','sha256'),'hex'),$2::uuid,$3::jsonb)`,
      [`workspace-bit-${i}`,id,JSON.stringify({currentParticipantId:`account-${id}`,participants:[{id:`account-${id}`,displayName:`Synthetic User ${i}`,kind:'user'}],groups:[],events:[],deletedEvents:[]})]);
  }
  const rawState=repaymentModeFixture(BIT_USERS.slice(0,4).map(id=>`account-${id}`));
  const state=buildSharedEventState(rawState,rawState.events[0].id);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[BIT_USERS[0]]);
  await db.query(`insert into public.app_snapshots(id,access_key_hash,snapshot_kind,state) values
    ($1,encode(extensions.digest('synthetic-bit-key','sha256'),'hex'),'shared_event',$2::jsonb)`,[BIT_SNAPSHOT,JSON.stringify(state)]);
  for(const [i,id] of BIT_USERS.slice(0,4).entries())await db.query(`insert into private.shared_snapshot_members(snapshot_id,user_id,participant_id,role)
    values($1,$2::uuid,$3,$4) on conflict(snapshot_id,user_id) do nothing`,[BIT_SNAPSHOT,id,`account-${id}`,i===0?'admin':'member']);
  let queue=Promise.resolve();
  const serial=run=>{const task=queue.then(run);queue=task.catch(()=>{});return task;};
  async function as(userId,run,role='authenticated'){
    return serial(async()=>{
      await db.exec('savepoint bit_rpc');
      try{
        await db.query("select set_config('request.jwt.claim.sub',$1,true)",[userId??'']);
        await db.query("select set_config('request.jwt.claim.role',$1,true)",[role]);
        await db.exec(`set local role ${role==='anon'?'anon':'authenticated'}`);
        const value=await run(db);
        await db.exec('reset role; release savepoint bit_rpc');return value;
      }catch(error){await db.exec('rollback to savepoint bit_rpc; release savepoint bit_rpc');
        throw Object.assign(new Error(error.message),{code:error.code});}
    });
  }
  const calls=[];
  const server=createServer(async(req,res)=>{
    const parts=[];for await(const chunk of req)parts.push(chunk);
    let body;try{body=JSON.parse(Buffer.concat(parts).toString()||'{}');}catch{res.writeHead(400).end('{}');return;}
    const index=Number(String(req.headers.authorization??'').replace('Bearer synthetic-token-',''));
    const userId=BIT_USERS[index];
    const name=new URL(req.url,'http://localhost').pathname.split('/').at(-1);
    calls.push({name,userId,body});
    try{
      if(!userId)throw Object.assign(new Error('Not authenticated'),{code:'42501'});
      const value=await as(userId,async db=>{
        if(name==='get_my_bit_shortcut')return(await db.query('select public.get_my_bit_shortcut() as value')).rows[0].value;
        if(name==='set_my_bit_shortcut')return(await db.query('select public.set_my_bit_shortcut($1,$2::bigint) as value',[body.p_bit_url,body.p_expected_revision])).rows[0].value;
        if(name==='get_transfer_bit_shortcut')return(await db.query('select public.get_transfer_bit_shortcut($1,$2) as value',[body.p_snapshot_id,body.p_transfer_id])).rows[0].value;
        throw Object.assign(new Error('Missing RPC'),{code:'PGRST202'});
      });
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(value));
    }catch(error){res.writeHead(error.code==='40001'?409:error.code==='42501'?403:400,{'content-type':'application/json'}).end(JSON.stringify({code:error.code,message:'Synthetic RPC rejected'}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const config=index=>({features:{bitQrProfile:true},storage:{mode:'supabase',url:`http://127.0.0.1:${server.address().port}`,
    anonKey:'synthetic-anon-key',account:{userId:BIT_USERS[index],accessToken:`synthetic-token-${index}`}}});
  return {db,as,config,calls,state,async begin(){await db.exec('begin');},async rollback(){await queue;await db.exec('rollback');},
    async close(){await new Promise(resolve=>server.close(resolve));await db.close();}};
  } catch(error) {
    await db.close();
    throw Object.assign(new Error(`Synthetic Bit database setup: ${error.message}`),{code:error.code});
  }
}
