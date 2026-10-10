import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {cleanSourceProvenance} from '../scripts/qa/android-native-isolated/provenance.mjs';

test('Native acceptance provenance reads actual Git source and rejects mismatches and probe changes',()=>{
  const root=mkdtempSync(join(tmpdir(),'sogrim-native-provenance-'));
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true}).trim();
  const plugin=join(root,'android/app/src/main/java/com/sogrimhashbon/app/SogrimCapabilitiesPlugin.java');
  try{
    mkdirSync(dirname(plugin),{recursive:true});writeFileSync(plugin,'class SogrimCapabilitiesPlugin {}\n');git(['init','-q']);git(['add','.']);git(['-c','user.name=Native QA','-c','user.email=native-qa@example.invalid','commit','-qm','Synthetic clean source']);
    const source=git(['rev-parse','HEAD']);assert.equal(cleanSourceProvenance(root,source).nativeDiagnosticAbsent,true);
    assert.throws(()=>cleanSourceProvenance(root,'0'.repeat(40)),/differs from actual HEAD/);
    writeFileSync(plugin,'class SogrimCapabilitiesPlugin { void getQaWebViewTypography(){} }\n');
    assert.throws(()=>cleanSourceProvenance(root,source),/changed product files/);
    git(['add','.']);git(['-c','user.name=Native QA','-c','user.email=native-qa@example.invalid','commit','-qm','Synthetic diagnostic source']);
    assert.throws(()=>cleanSourceProvenance(root,git(['rev-parse','HEAD'])),/probe must be removed/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
