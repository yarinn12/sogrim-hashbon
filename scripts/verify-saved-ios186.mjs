import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {verifySavedIpa,SAVED_IOS_ARTIFACT} from './lib/ios-testflight-saved-artifact.mjs';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const manifest=await read('build/ios/release-manifest.json');
const evidence=verifySavedIpa({manifest,prior:await read('build/ios/testflight-one-shot-before-build.json'),ipa:await readFile('build/ios/SogrimHashbon.ipa'),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),run:await read('build/ios/saved-build-run.json'),job:await read('build/ios/saved-build-job.json'),qaRun:await read('build/ios/merged-source-qa.json')});
await writeFile('build/ios/original-release-manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('build/ios/saved-artifact-verification.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
