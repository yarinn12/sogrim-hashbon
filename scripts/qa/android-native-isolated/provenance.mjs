import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export function cleanSourceProvenance(repository, expectedSource) {
  if(!/^[a-f0-9]{40}$/.test(expectedSource||''))throw new Error('Require exact ANDROID_QA_SOURCE commit SHA');
  const git=args=>execFileSync('git',['-C',repository,...args],{encoding:'utf8',windowsHide:true}).trim();
  const sourceCommit=git(['rev-parse','HEAD']);
  if(sourceCommit!==expectedSource)throw new Error('Requested Native source differs from actual HEAD');
  const allowed=name=>name.startsWith('scripts/qa/android-native-isolated/')||/^tests\/androidNative(IsolatedFixture|MatrixVerdict|FontRatio|Provenance|TextGeometry|Observation|EmulatorBoot|EmulatorKey)\.test\.mjs$/.test(name)||['android/app/capacitor.build.gradle','android/capacitor.settings.gradle','ios/App/CapApp-SPM/Package.swift'].includes(name);
  const changed=git(['diff','--name-only','HEAD']).split(/\r?\n/).filter(Boolean);
  const rejected=changed.filter(name=>!allowed(name));
  if(rejected.length)throw new Error('Clean Native source required; changed product files: '+rejected.join(', '));
  const plugin=readFileSync(join(repository,'android/app/src/main/java/com/sogrimhashbon/app/SogrimCapabilitiesPlugin.java'),'utf8');
  if(plugin.includes('getQaWebViewTypography'))throw new Error('Diagnostic Native probe must be removed for acceptance');
  return {sourceCommit,sourceTree:git(['rev-parse','HEAD^{tree}']),allowedGeneratedChanges:changed.filter(name=>!name.startsWith('scripts/')&&!name.startsWith('tests/')),nativeDiagnosticAbsent:true};
}
