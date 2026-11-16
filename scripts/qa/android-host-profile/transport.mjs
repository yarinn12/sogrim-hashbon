import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertAsgSchema,assertAsgSelection} from '../android-native-isolated/gltransport.mjs';
import {SCHEMA_SHA} from './contract.mjs';
export function verifySchema(bytes){
  assert.equal(createHash('sha256').update(bytes).digest('hex'),SCHEMA_SHA,'Installed transport schema differs');
  return assertAsgSchema(bytes);
}
export function verifyTransport(log,guest,mode){
  assert.equal(mode,'asg','This diagnostic retains the original ASG transport');
  return assertAsgSelection(log,guest);
}
