import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const CONTRACT=Object.freeze({
 repository:'yarinn12/sogrim-hashbon',repositoryId:1247836328,version:'4.59',build:'195',
 signingBranch:'codex/ios195-459-signing-envelope-20261109',
 signingPath:'.github/workflows/ios195-459-private-sign-only-envelope-20261109.yml',
 signingName:'iOS195 4.59 private signed artifact only',
 intakeBranch:'codex/ios195-459-private-intake-20261105',
 intakePath:'.github/workflows/ios195-459-private-intake-only-20261105.yml',
 artifactName:'sogrim-ios-4.59-195-encrypted',
 producerVerifierSha256:'aae39c0e3fe47afaa6cc2ea8727f23e68ab86ccd2fd3d4141c71701c9812db82'
});
const freeze=value=>{for(const item of Object.values(value??{}))if(item&&typeof item==='object')freeze(item);return Object.freeze(value);};
export const INTAKE_BINDINGS=freeze(JSON.parse(readFileSync(new URL('./intake-bindings.json',import.meta.url),'utf8')));
export const integer=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
export const decimal=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&integer(Number(value));
export const digest=(value,length)=>typeof value==='string'&&new RegExp('^[0-9a-f]{'+length+'}$').test(value)&&!/^0+$/.test(value);

export function requireBoundIntakePins(pins=INTAKE_BINDINGS){
 assert.ok(pins&&typeof pins==='object'&&!JSON.stringify(pins).includes('PENDING'),'Final intake bindings remain PENDING');
 assert.equal(pins.schemaVersion,1);
 const a=pins.application,s=pins.signing;
 for(const value of [a?.sourceSha,a?.sourceTree,s?.toolsSha])assert.ok(digest(value,40),'Invalid source/tree/signing SHA');
 assert.ok(typeof a.branch==='string'&&/^codex\/[A-Za-z0-9._/-]+$/.test(a.branch)&&!a.branch.includes('..'),'Invalid final source branch');
 assert.ok(decimal(a.pwa),'Invalid final PWA release');
 assert.deepEqual(Object.keys(a.ciRuns??{}).sort(),['SOURCE_AUTH_QA_RUN','SOURCE_FONT_QA_RUN','SOURCE_QA_RUN','SOURCE_WINDOWS_QA_RUN']);
 for(const value of Object.values(a.ciRuns))assert.ok(decimal(value),'Invalid final source CI run');
 assert.equal(new Set(Object.values(a.ciRuns)).size,4,'Source CI runs must be distinct');
 for(const value of [s.runId,s.artifactId])assert.ok(decimal(value),'Invalid original signing run/artifact ID');
 for(const value of [s.runNumber,s.jobId,s.artifactSize,s.ipaSize,s.ciphertextSize])assert.ok(integer(value),'Original signing counter/job/size must be positive safe integers');
 for(const value of [s.zipSha256,s.ipaSha256,s.ciphertextSha256,...Object.values(s.controls??{})])assert.ok(digest(value,64),'Original digest/control SHA256 missing');
 assert.deepEqual(Object.keys(s.controls??{}).sort(),['firstCreation','requiredJobs','sourceGuard','workflow']);
 assert.equal(s.controls.firstCreation,CONTRACT.producerVerifierSha256,'Unreviewed Nov5 first-creation verifier');
 for(const value of [s.artifactSize,s.ipaSize,s.ciphertextSize])assert.ok(value<=536870912,'Unbounded original artifact size');
 return pins;
}
export function boundEnvironment(pins=INTAKE_BINDINGS){
 requireBoundIntakePins(pins);const a=pins.application,s=pins.signing;
 return {SOURCE_SHA:a.sourceSha,SOURCE_TREE:a.sourceTree,PWA_RELEASE:a.pwa,...a.ciRuns,
  IOS_VERSION:CONTRACT.version,IOS_BUILD:CONTRACT.build,SIGNING_TOOLS_SHA:s.toolsSha,
  SIGNED_RUN_ID:s.runId,SIGNED_RUN_NUMBER:String(s.runNumber),SIGNED_JOB_ID:String(s.jobId),
  SIGNED_ARTIFACT_ID:s.artifactId,SIGNED_ARTIFACT_SIZE:String(s.artifactSize),
  SIGNED_IPA_SHA256:s.ipaSha256,SIGNED_IPA_SIZE:String(s.ipaSize),
  SIGNED_ARTIFACT_ZIP_SHA256:s.zipSha256,SIGNED_CIPHERTEXT_SHA256:s.ciphertextSha256,SIGNED_CIPHERTEXT_SIZE:String(s.ciphertextSize)};
}
export function requireBoundEnvironment(env,pins=INTAKE_BINDINGS){
 const expected=boundEnvironment(pins);
 for(const [key,value]of Object.entries(expected))assert.equal(env[key],value,'Immutable intake environment differs: '+key);
 return pins;
}
export function main(env=process.env){
 requireBoundEnvironment(env);
 if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,'source_sha='+INTAKE_BINDINGS.application.sourceSha+
  '\nsigning_tools_sha='+INTAKE_BINDINGS.signing.toolsSha+'\n');
 console.log('All immutable intake pins are bound; no key, download or decryption accessed.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))main();
