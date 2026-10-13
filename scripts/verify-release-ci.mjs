import { appendFile, writeFile } from "node:fs/promises";
import { evaluateReleaseCi, REQUIRED_RELEASE_WORKFLOWS } from "./lib/release-ci-policy.mjs";

const argument = name => { const n = process.argv.indexOf(name); return n < 0 ? undefined : process.argv[n + 1]; };
const source = argument("--sha") || process.env.GITHUB_SHA;
const repository = process.env.GITHUB_REPOSITORY;
const candidateBranch = argument("--candidate-branch");
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("A read-only GitHub Actions token is required for CI verification");
if (!/^[a-f0-9]{40}$/.test(source ?? "") || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) throw new Error("Invalid source identity");
async function get(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`GitHub CI metadata request failed: ${response.status}`);
  return response.json();
}
const all = [];
if (!candidateBranch || process.argv.includes("--require-main-head")) {
  const branch = await get("branches/main");
  if (branch.commit?.sha !== source) throw new Error("Release source is not the current main commit");
}
for (let page = 1; page <= 10; page++) {
  const result = await get(`actions/runs?head_sha=${source}&per_page=100&page=${page}`);
  all.push(...result.workflow_runs);
  if (result.workflow_runs.length < 100) break;
  if (page === 10) throw new Error("CI metadata pagination limit; refusing partial verification");
}
const candidates = all.filter(run => REQUIRED_RELEASE_WORKFLOWS.some(file => run.path?.split("@")[0].endsWith(`/`+file)));
const jobsByRun = {};
for (const run of candidates) {
  const jobs=[];
  for (let page=1;page<=10;page++) {
    const result=await get(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`);
    jobs.push(...result.jobs);
    if(result.jobs.length<100)break;
    if(page===10)throw new Error("Job pagination limit; refusing partial verification");
  }
  jobsByRun[run.id]=jobs;
}
const verdict=evaluateReleaseCi({source,repository,runs:all,jobsByRun,candidateBranch});
await writeFile("release-ci-receipt.json",JSON.stringify(verdict,null,2)+"\n");
console.log(JSON.stringify(verdict,null,2));
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`ready=${verdict.passed}\nsource=${source}\n`);
if(!verdict.passed&&!process.argv.includes("--defer-pending"))process.exitCode=1;
if(verdict.failures.length)process.exitCode=1;
