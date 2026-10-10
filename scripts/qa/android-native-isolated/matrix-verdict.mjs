import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function matrixExitCode(results,expectedCases=6){
  const failed=results.length!==expectedCases||results.some(row=>row.error||!Array.isArray(row.checks)||!row.checks.length||row.checks.some(check=>check.ok!==true));
  return failed ? 1 : 0;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const {results,expectedCases}=JSON.parse(readFileSync(0,'utf8'));
  process.exitCode=matrixExitCode(results,expectedCases);
}
