import test from 'node:test';
import assert from 'node:assert/strict';
import {closeSaveAcknowledged} from '../e2e/helpers/connectedPaymentFixture.mjs';

test('a recorded close write and optimistic render do not count as a save acknowledgement',()=>{
  const earlier=['saving','saved'];
  const afterCloseStart=earlier.length;
  assert.equal(closeSaveAcknowledged([...earlier,'saving'],afterCloseStart),false);
  assert.equal(closeSaveAcknowledged([...earlier,'saving','reconnecting'],afterCloseStart),false);
  assert.equal(closeSaveAcknowledged([...earlier,'saving','saved'],afterCloseStart),true);
  assert.equal(closeSaveAcknowledged([...earlier,'saving','saved','saving'],afterCloseStart),false);
});
