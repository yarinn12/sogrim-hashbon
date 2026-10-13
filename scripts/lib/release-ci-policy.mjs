export const REQUIRED_RELEASE_WORKFLOWS = [
  "qa.yml", "qa-windows.yml", "cross-engine-font-provenance-qa.yml", "ios-auth-return-qa.yml"
];
const pathOf = run => run.path?.split("@")[0]?.split("/").at(-1);

export function evaluateReleaseCi({ source, repository, runs, jobsByRun = {} }) {
  if (!/^[a-f0-9]{40}$/.test(source ?? "")) throw new Error("Release needs an exact commit SHA");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) throw new Error("Release needs an exact repository");
  const accepted = [], missing = [], failures = [];
  for (const workflow of REQUIRED_RELEASE_WORKFLOWS) {
    const initialFailures = failures.length;
    const candidates = runs.filter(run => pathOf(run) === workflow && run.head_sha === source &&
      run.repository?.full_name === repository && run.head_repository?.full_name === repository);
    candidates.sort((a,b) => b.id - a.id || b.run_attempt - a.run_attempt);
    const run = candidates[0];
    if (!run || run.status !== "completed") { missing.push(workflow); continue; }
    if (run.conclusion !== "success") { failures.push(`${workflow}: ${run.conclusion}`); continue; }
    const jobs = jobsByRun[run.id];
    if (!jobs?.length || jobs.some(job => job.status !== "completed" || job.conclusion !== "success" || job.head_sha !== source)) {
      failures.push(`${workflow}: jobs missing, skipped, failed or from another source`); continue;
    }
    if (workflow === "qa.yml") {
      const names = new Set(jobs.map(job => job.name));
      for (const expected of ["unit", "backup-runtime", "two-client-sync", "cross-platform", "unit-and-mobile",
        "mobile (android-mobile)", "mobile (iphone-webkit)", "mobile (ipad-webkit)", "mobile (iphone-large-text)", "mobile (reflow-200)",
        "android-native / native-parity", "ios-native / native-parity"]) {
        if (!names.has(expected)) failures.push(`qa.yml: missing required job ${expected}`);
      }
    }
    if (initialFailures === failures.length) accepted.push({ workflow, run: run.id, attempt: run.run_attempt, source, jobs: jobs.length });
  }
  return { source, repository, passed: !missing.length && !failures.length, accepted, missing, failures };
}
