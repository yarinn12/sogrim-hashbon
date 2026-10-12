import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function matrixExitCode(results,expectedCases=6){
  const expected=[1,1.5,2].flatMap(scale=>['portrait','landscape'].map(orientation=>`${scale}/${orientation}`));
  const keys=results.map(row=>`${row.scale}/${row.orientation}`);
  const failed=expectedCases!==6||results.length!==6||new Set(keys).size!==6||expected.some(key=>!keys.includes(key))||results.some(row=>row.error||!Array.isArray(row.checks)||!row.checks.length||row.checks.some(check=>check.ok!==true));
  return failed ? 1 : 0;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const {results,expectedCases}=JSON.parse(readFileSync(0,'utf8'));
  process.exitCode=matrixExitCode(results,expectedCases);
}
