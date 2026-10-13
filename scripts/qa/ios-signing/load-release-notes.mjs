import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const DELIMITER='SOGRIM_RELEASE_NOTES_4_58_194';
export function releaseNotesEnvironment(metadata){
  assert.equal(metadata.app.bundleId,'com.sogrimhashbon.app');
  assert.equal(metadata.version.number,'4.58');assert.equal(metadata.version.build,'194');
  const notes=metadata.version.releaseNotes;
  assert.equal(typeof notes,'string');assert.ok(notes.trim().length>=1&&notes.trim().length<=4000);
  assert.ok(!notes.split(/\r?\n/).includes(DELIMITER),'Release notes must not terminate the environment block');
  return 'IOS_RELEASE_NOTES<<'+DELIMITER+'\n'+notes.trim()+'\n'+DELIMITER+'\n';
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  assert.ok(process.env.GITHUB_ENV,'Missing workflow environment file');
  appendFileSync(process.env.GITHUB_ENV,releaseNotesEnvironment(JSON.parse(readFileSync('docs/store-submission/app-store-metadata-he.json','utf8'))));
  console.log('Public release notes loaded from the exact frozen application metadata.');
}
