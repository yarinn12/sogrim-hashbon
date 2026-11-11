import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {unprotect} from '../scripts/qa/ios-signing/protect-artifact.mjs';

const cli=fileURLToPath(new URL('../scripts/qa/ios-signing/protect-artifact.mjs',import.meta.url));
const sha=data=>createHash('sha256').update(data).digest('hex');
function fixture(t,change=()=>{}){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ios-envelope-cli-')));
 t.after(()=>{assert.equal(dirname(root),realpathSync(tmpdir()));rmSync(root,{recursive:true,force:true});});
 const build=join(root,'build','ios');mkdirSync(build,{recursive:true});
 const ipa=Buffer.from('SYNTHETIC_PACKAGE_BYTES_ONLY_NOT_A_SIGNED_IPA');
 const archive=Buffer.from('SYNTHETIC_ORIGINAL_ARCHIVE_BYTES');
 const proof={sourceCommit:process.env.SOURCE_SHA,sourceTree:'0e5ed5a7871a1b320578573d7d108e3f31b02920',
  version:'4.59',build:'196',ipaSha256:sha(ipa),appleUploadPerformed:false,
  signatureVerified:true,everyWwwAssetMatches:true,everyWwwAssetMatchesCanonicalGitBuild:true};
 // Actual producer contract: verify-ios-artifact writes bytes/sha256 into the
 // release manifest. verify-web-assets writes its own proof without bytes,
 // then merges that proof into the release manifest, retaining the size.
 const release={bundleId:'com.sogrimhashbon.app',teamId:'MA9S4L7WKS',artifact:'SogrimHashbon.ipa',
  bytes:ipa.length,sha256:sha(ipa).toUpperCase(),...proof};
 change(release);
 writeFileSync(join(build,'artifact-verification.json'),JSON.stringify(proof));
 writeFileSync(join(build,'release-manifest.json'),JSON.stringify(release));
 writeFileSync(join(build,'SogrimHashbon.ipa'),ipa);writeFileSync(join(root,'original.tar'),archive);
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
 const env={...process.env,APPSTORE_API_PRIVATE_KEY:key,GITHUB_RUN_ID:'synthetic',GITHUB_RUN_ATTEMPT:'1'};
 delete env.NODE_TEST_CONTEXT;
 const child=spawnSync(process.execPath,[cli,'encrypt','original.tar','protected'],
  {cwd:root,env,encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(child.error,undefined);
 return {root,ipa,archive,key,proof,release,child};
}
test('actual encryption CLI consumes the merged release report when the separate asset proof has no bytes',t=>{
 const f=fixture(t);assert.equal(Object.hasOwn(f.proof,'bytes'),false);
 assert.equal(f.child.status,0,f.child.stdout+'\n'+f.child.stderr);
 const out=join(f.root,'protected');assert.deepEqual(readdirSync(out).sort(),['envelope.json','release.tar.enc']);
 const envelope=JSON.parse(readFileSync(join(out,'envelope.json')));
 assert.deepEqual(unprotect(readFileSync(join(out,'release.tar.enc')),envelope,f.key),f.archive);
 const line=f.child.stdout.split(/\r?\n/).find(s=>s.startsWith('PUBLIC_ORIGINAL_SIGNED_IPA_IDENTITY '));
 assert.deepEqual(JSON.parse(line.slice('PUBLIC_ORIGINAL_SIGNED_IPA_IDENTITY '.length)),
  {ipaSha256:sha(f.ipa),ipaSize:f.ipa.length});
});
for(const [name,change] of [
 ['missing verified size',r=>delete r.bytes],['changed size',r=>r.bytes++],
 ['zero size',r=>r.bytes=0],['unbounded size',r=>r.bytes=536870913],
 ['changed package digest',r=>r.ipaSha256='a'.repeat(64)],
 ['unverified signature',r=>r.signatureVerified=false],
 ['unmatched web assets',r=>r.everyWwwAssetMatches=false],
 ['missing canonical proof',r=>r.everyWwwAssetMatchesCanonicalGitBuild=false],
 ['unexpected Apple upload',r=>r.appleUploadPerformed=true]
])test('actual encryption CLI rejects '+name+' in the merged report',t=>{
 const f=fixture(t,change);assert.notEqual(f.child.status,0);
 assert.ok(!readdirSync(f.root).includes('protected'),'Rejected input must not write encrypted output');
});
