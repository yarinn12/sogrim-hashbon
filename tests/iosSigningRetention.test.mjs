import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTRACT} from '../scripts/qa/ios-signing/first-creation-guard.mjs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8').replaceAll('\r\n','\n');
function requireOneDayEncryptedArtifact(raw) {
  const steps=raw.replaceAll('\r\n','\n').split(/^      - name: /m).slice(1)
    .filter(step=>/^        uses: actions\/upload-artifact@v6$/m.test(step));
  assert.equal(steps.length,1,'Exactly one encrypted release upload step');
  const step=steps[0];
  const days=[...step.matchAll(/^          retention-days: (.+)$/gm)];
  assert.equal(days.length,1,'One explicit retention-days setting');
  assert.equal(days[0][1],'1','User-approved artifact retention is one day');
  const path=/^          path: \|\n((?:            [^\n]+\n)+)/m.exec(step)?.[1];
  assert.ok(path,'Explicit encrypted artifact paths');
  assert.deepEqual(path.trim().split('\n').map(line=>line.trim()),[
    'app/build/ios/private-artifact/release.tar.enc',
    'app/build/ios/private-artifact/envelope.json'
  ],'Only encrypted archive and envelope may be retained');
}
const good=`      - name: Retain encrypted output for one day
        uses: actions/upload-artifact@v6
        with:
          path: |
            app/build/ios/private-artifact/release.tar.enc
            app/build/ios/private-artifact/envelope.json
          retention-days: 1
`;
test('active signing workflow retains only encrypted output for the approved one day',()=>requireOneDayEncryptedArtifact(read(CONTRACT.path)));
test('disabled signing template preserves the same one-day retention boundary',()=>requireOneDayEncryptedArtifact(read('.github/workflows/ios-testflight.yml')));
test('seven-day retention is rejected',()=>assert.throws(()=>requireOneDayEncryptedArtifact(good.replace('retention-days: 1','retention-days: 7')),/one day/));
test('omitted retention is rejected',()=>assert.throws(()=>requireOneDayEncryptedArtifact(good.replace('          retention-days: 1\n','')),/explicit retention/));
test('plaintext IPA retention is rejected',()=>assert.throws(()=>requireOneDayEncryptedArtifact(good.replace('release.tar.enc','SogrimHashbon.ipa')),/Only encrypted/));
test('a second upload step is rejected',()=>assert.throws(()=>requireOneDayEncryptedArtifact(good+good),/Exactly one/));
