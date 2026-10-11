import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {cleanSourceProvenance} from './provenance.mjs';

const root = process.cwd(), directory = join(root, "scripts/qa/android-native-isolated");
const source=cleanSourceProvenance(root,process.env.ANDROID_QA_SOURCE);
if(process.env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD!=='1')throw new Error('Private environment must be disabled for isolated Native acceptance');
const htmlPath = join(root, "www/index.html");
const originalHtml = await readFile(htmlPath, "utf8");
if (originalHtml.includes('android-native-qa-fixture.js')) throw new Error('Fixture already prepared');
await copyFile(join(directory, "fixture.js"), join(root, "www/android-native-qa-fixture.js"));
const fixtureHtml = originalHtml.replace(/<head>/, '<head>\n<script src="./android-native-qa-fixture.js"></script>');
if (fixtureHtml === originalHtml) throw new Error('Expected native HTML head is missing');
await writeFile(htmlPath, fixtureHtml, "utf8");
const hash = text => createHash('sha256').update(text).digest('hex');
await mkdir(join(root, 'artifacts/android-native-isolated'), { recursive: true });
await writeFile(join(root, 'artifacts/android-native-isolated/fixture-provenance.json'), JSON.stringify({
  ...source,
  derivedArtifactOnly: true, privateEnvDisabled: true, bootstrapIsSynthetic: true,
  originalBuiltIndexSha256: hash(originalHtml), fixtureIndexSha256: hash(fixtureHtml),
  fixtureSha256: hash(await readFile(join(directory, 'fixture.js'))),
  runtimeSourceChanged: false, productCssChanged: false,
  syntheticConnectivityAdvertised: true, physicalEmulatorNetworkDisabled: true,
  excludedFromAcceptance: ['real login', 'production database', 'real push', 'Play upgrade', 'release performance', 'real connectivity and offline recovery'],
}, null, 2) + '\n');
console.log('Prepared isolated synthetic fixture in derived WWW only.');
