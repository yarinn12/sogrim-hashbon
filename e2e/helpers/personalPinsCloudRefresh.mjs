// Incoming-change QA must observe a real delivered full snapshot in the same
// document. Reload persistence is exercised by the separate persistence cases.
export async function refreshPersonalPinsSnapshot(page, { origin, space, updatedAt }) {
  const snapshot = page.waitForResponse(async response => {
    const url = new URL(response.url());
    if (url.origin !== origin || url.pathname !== "/rest/v1/app_snapshots" ||
        url.searchParams.get("id") !== `eq.${space}` || response.request().method() !== "GET") return false;
    if (!response.ok()) throw new Error(`Synthetic account snapshot returned ${response.status()}`);
    const rows = await response.json();
    return Array.isArray(rows) && rows.some(row => (row.id === undefined || row.id === space) && row.updated_at === updatedAt &&
      row.state && typeof row.state === "object" && Array.isArray(row.state.events));
  });
  const [response] = await Promise.all([snapshot, page.bringToFront()]);
  const failure = await response.finished();
  if (failure) throw failure;
}
