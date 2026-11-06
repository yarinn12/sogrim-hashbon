// Diagnostic tool instrumentation only. Both arms use identical ownership checks.
// Frozen application files, their test scripts and their budgets are unchanged.
import cp from 'node:child_process';
import {readFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {installAudit} from './owned.mjs';
if(!process.env.ANDROID_TRANSPORT_OWNER_FILE)throw new Error('Require explicit diagnostic owner receipt');
installAudit(cp,JSON.parse(readFileSync(process.env.ANDROID_TRANSPORT_OWNER_FILE,'utf8')));
syncBuiltinESMExports();
