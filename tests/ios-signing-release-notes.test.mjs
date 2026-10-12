import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {releaseNotesEnvironment} from '../scripts/qa/ios-signing/load-release-notes.mjs';

const repository=fileURLToPath(new URL('../',import.meta.url));
const root=resolve(process.env.IOS_RELEASE_SOURCE_DIR||repository);
const metadata=JSON.parse(readFileSync(resolve(root,'docs/store-submission/app-store-metadata-he.json')));
const certificate=Buffer.alloc(512);certificate[0]=0x30;
const fixture={APPLE_TEAM_ID:'MA9S4L7WKS',APPSTORE_ISSUER_ID:'00000000-1111-2222-3333-444444444444',APPSTORE_API_KEY_ID:'ABCDE12345',IOS_VERSION:'4.58',IOS_BUILD:'193',GOOGLE_CLIENT_ID:'123456-validclientabcdefghijklmnop.apps.googleusercontent.com',GOOGLE_IOS_CLIENT_ID:'123456-otherclientabcdefghijklmnop.apps.googleusercontent.com',APPSTORE_API_PRIVATE_KEY:'-----BEGIN PRIVATE KEY-----\nSYNTHETIC_CONTROL_ONLY\n-----END PRIVATE KEY-----',APPSTORE_CERTIFICATES_FILE_BASE64:certificate.toString('base64'),APPSTORE_CERTIFICATES_PASSWORD:'SYNTHETIC_CONTROL_ONLY'};
const validate=extra=>spawnSync(process.execPath,['scripts/verify-ios-workflow-env.mjs'],{cwd:root,env:{...process.env,...fixture,IOS_RELEASE_NOTES:'',...extra},encoding:'utf8'});

test('missing release notes reproduces the actual pre-build configuration failure',()=>{
  const result=validate({});assert.notEqual(result.status,0);
  assert.match(result.stderr,/IOS_RELEASE_NOTES is missing or invalid/);
});
test('frozen metadata notes pass the unchanged application configuration validator',()=>{
  const environment=releaseNotesEnvironment(metadata);
  const notes=environment.split('\n').slice(1,-2).join('\n');
  assert.equal(notes,metadata.version.releaseNotes);
  const result=validate({IOS_RELEASE_NOTES:notes});assert.equal(result.status,0,result.stderr);
});
for(const [name,change] of [
  ['wrong bundle',m=>m.app.bundleId='other'],['wrong version',m=>m.version.number='4.57'],
  ['wrong build',m=>m.version.build='192'],['empty notes',m=>m.version.releaseNotes=' '],
  ['oversized notes',m=>m.version.releaseNotes='x'.repeat(4001)],
  ['environment delimiter injection',m=>m.version.releaseNotes='text\nSOGRIM_RELEASE_NOTES_4_58_193\nOTHER=value']
])test('release notes reject '+name,()=>{const value=structuredClone(metadata);change(value);assert.throws(()=>releaseNotesEnvironment(value));});
