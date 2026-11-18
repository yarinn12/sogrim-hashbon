// Hold one already-formed conditional write so a second client can commit first.
// Reads, authentication and the fixture's actual CAS rejection remain intact.
export async function snapshotWriteBarrier(page, { origin, workspaceId, accepts }) {
  let release, arrived, held = false;
  const gate = new Promise(resolve => { release = resolve; });
  const observed = new Promise(resolve => { arrived = resolve; });
  await page.route(`${origin}/rest/v1/app_snapshots?**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (!held && request.method() === "PATCH" && url.origin === origin &&
        url.searchParams.get("id") === `eq.${workspaceId}` && accepts(request.postDataJSON())) {
      held = true;
      arrived({ expectedVersion: url.searchParams.get("updated_at") });
      await gate;
    }
    await route.fallback();
  });
  return { observed, released: gate, release: () => release() };
}
