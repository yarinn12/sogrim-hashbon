import { createReleaseCheckpoint } from "./lib/release-checkpoint.mjs";
const index = process.argv.indexOf("--name");
try {
  const receipt = createReleaseCheckpoint({ cwd: process.cwd(), name: index < 0 ? undefined : process.argv[index + 1] });
  console.log(JSON.stringify(receipt, null, 2));
  console.log(`Retain remotely with: git push origin refs/tags/${receipt.name}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
