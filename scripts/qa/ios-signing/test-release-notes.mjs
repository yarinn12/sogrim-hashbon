import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseNotesEnvironment} from './load-release-notes.mjs';
const fixture={app:{bundleId:'com.sogrimhashbon.app'},version:{number:'4.58',build:'193',releaseNotes:'שיפור מסכים ושמירת טיוטות.'}};
test('loaded notes equal the actual frozen application metadata',()=>{
 assert.ok(process.env.IOS_RELEASE_METADATA_FILE,'Frozen metadata path is mandatory');
 const actual=JSON.parse(readFileSync(process.env.IOS_RELEASE_METADATA_FILE,'utf8'));
 const encoded=releaseNotesEnvironment(actual);
 assert.equal(process.env.IOS_RELEASE_NOTES,actual.version.releaseNotes.trim());
 assert.ok(encoded.includes('\n'+process.env.IOS_RELEASE_NOTES+'\n'));
});
test('environment block preserves Hebrew and line breaks',()=>{
 const value=structuredClone(fixture);value.version.releaseNotes='אחידות מסכים\nשמירת טיוטות';
 assert.equal(releaseNotesEnvironment(value),'IOS_RELEASE_NOTES<<SOGRIM_RELEASE_NOTES_4_58_193\nאחידות מסכים\nשמירת טיוטות\nSOGRIM_RELEASE_NOTES_4_58_193\n');
});
for(const [name,change] of [
 ['another app',m=>m.app.bundleId='other.app'],
 ['another version',m=>m.version.number='4.57'],
 ['another build',m=>m.version.build='192'],
 ['empty notes',m=>m.version.releaseNotes='  '],
 ['oversized notes',m=>m.version.releaseNotes='x'.repeat(4001)],
 ['environment delimiter injection',m=>m.version.releaseNotes='x\nSOGRIM_RELEASE_NOTES_4_58_193\ny']
])test('release notes reject '+name,()=>{
 const value=structuredClone(fixture);change(value);assert.throws(()=>releaseNotesEnvironment(value));
});
