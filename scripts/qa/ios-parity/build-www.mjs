import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(process.env.APP_SHA || '') || sha !== process.env.APP_SHA) {
  throw new Error('The unsigned QA bundle requires the exact APP_SHA checkout');
}
try { await access(resolve(root, 'www')); throw new Error('Preserve an existing WWW instead of overwriting it'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
process.env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD = '1';
const gradle = await readFile(resolve(root, 'android/app/build.gradle'), 'utf8');
const config = {
  storage: { mode: 'supabase', url: 'https://ios-native-qa.supabase.co', anonKey: 'synthetic-ios-native-anon' },
  auth: {}, updates: { android: { currentBuild: Number(gradle.match(/versionCode\s+(\d+)/)[1]), required: false } }
};
globalThis.fetch = async () => new Response(JSON.stringify(config), {
  status: 200, headers: { 'content-type': 'application/json' }
});
await import(pathToFileURL(resolve(root, 'scripts/build-native-web.mjs')));
console.log('Unsigned synthetic iOS QA bundle:', sha);
