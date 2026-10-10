import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from 'node:child_process';

const root = process.cwd(), directory = join(root, "scripts/qa/android-native-isolated");
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
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
  sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8', windowsHide: true }).trim(),
  derivedArtifactOnly: true, privateEnvDisabled: true, bootstrapIsSynthetic: true,
  originalBuiltIndexSha256: hash(originalHtml), fixtureIndexSha256: hash(fixtureHtml),
  fixtureSha256: hash(await readFile(join(directory, 'fixture.js'))),
  runtimeSourceChanged: false, productCssChanged: false,
  syntheticConnectivityAdvertised: true, physicalEmulatorNetworkDisabled: true,
  excludedFromAcceptance: ['real login', 'production database', 'real push', 'Play upgrade', 'release performance', 'real connectivity and offline recovery'],
}, null, 2) + '\n');
console.log('Prepared isolated synthetic fixture in derived WWW only.');
