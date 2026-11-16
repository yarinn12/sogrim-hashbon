import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/ios-parity-qa.yml',import.meta.url),'utf8');

test('unsigned iOS build finishes before the owned simulator is erased and booted for measurement',()=>{
  const start=workflow.indexOf('          python3 - <<\'PY\' > build/native-parity/simulator.env');
  const end=workflow.indexOf('      - name: Verify normal and real OS accessibility sizes',start);
  assert.ok(start>=0 && end>start,'expected the original owned simulator and measurement steps');
  const setup=workflow.slice(start,end);
  const markers=[
    "['xcrun','simctl','create','Capacitor parity QA'",
    'build-for-testing CODE_SIGNING_ALLOWED=NO',
    'xcrun simctl shutdown "$PROBE_UDID"',
    'test "$state" = Shutdown',
    'xcrun simctl erase "$PROBE_UDID"',
    'xcrun simctl boot "$PROBE_UDID"',
    'xcrun simctl bootstatus "$PROBE_UDID" -b'
  ];
  const positions=markers.map(marker=>setup.indexOf(marker));
  assert.ok(positions.every(position=>position>=0),`missing lifecycle command: ${markers[positions.indexOf(-1)]}`);
  assert.ok(positions.every((position,index)=>index===0 || position>positions[index-1]),
    'create, build, shutdown, assert Shutdown, erase, boot, and bootstatus must stay ordered');
  assert.equal((workflow.match(/build-for-testing CODE_SIGNING_ALLOWED=NO/g)||[]).length,1);
  const measured=workflow.slice(end,workflow.indexOf('      - name: Preserve native diagnostics',end));
  assert.match(measured,/test-without-building CODE_SIGNING_ALLOWED=NO/);
  assert.doesNotMatch(measured,/build-for-testing/);
  assert.match(workflow,/if: failure\(\)/);
  assert.match(workflow,/app\/build\/native-parity\/\*\.log/);
});
