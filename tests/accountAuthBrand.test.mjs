import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('auth brand refresh keeps the same current mark as the app header after a gate rerender',async()=>{
  const source=(await readFile('src/publicCircleDesignLayer.mjs','utf8')).replaceAll('\r\n','\n');
  const start=source.indexOf('function keepBrandAssetsCurrent(');
  const end=source.indexOf('\n}\n',start)+2;
  assert(start>=0&&end>start);
  const attributes=new Map([['src','./app-icon-exterior-192.png']]);
  const authImage={getAttribute:key=>attributes.get(key),setAttribute:(key,value)=>attributes.set(key,value)};
  const context=vm.createContext({document:{querySelectorAll:selector=>selector==='.account-auth-mark img'?[authImage]:[]}});
  vm.runInContext(source.slice(start,end),context);
  vm.runInContext('keepBrandAssetsCurrent()',context);
  assert.equal(attributes.get('src'),'./app-icon-exterior-192.png','the gate observer must not restore the retired logo');
  attributes.set('src','./icon-192.png');
  vm.runInContext('keepBrandAssetsCurrent()',context);
  assert.equal(attributes.get('src'),'./app-icon-exterior-192.png','a newly mounted gate must be brought to the current logo');
});
