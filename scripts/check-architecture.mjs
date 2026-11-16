import { inspectArchitecture } from "./lib/architecture-boundaries.mjs";

const result = await inspectArchitecture(process.cwd());
console.log(JSON.stringify(result, null, 2));
if (result.violations.length) process.exitCode = 1;
