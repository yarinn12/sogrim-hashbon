import { personalPinsCloud } from "./personalPinsCloud.mjs";

// Same mocked workspace transport as the existing independent-client tests.
// Both contexts exist before the test records its local/canonical baselines.
export async function settlementIncomingWorkspace(page, browser, baseURL, initialState) {
  const accountId = "settlement-confirmation-owner";
  const space = `personal-pins-cloud-space-${accountId}`;
  const cloud = await personalPinsCloud(page, baseURL, initialState, {
    accountId, profileUpdatedAt: "2026-11-18T08:00:00.000Z"
  });
  const peerContext = await browser.newContext({ baseURL, locale: "he-IL" });
  try {
    const peer = await peerContext.newPage();
    await cloud.connectPage(peer);
    await page.bringToFront();
    return {
      cloud,
      localEvents: () => page.evaluate(space => {
        const raw = localStorage.getItem(`settle-friends-state:${space}`);
        if (!raw) throw new Error("Synthetic cloud workspace cache is missing");
        return JSON.parse(raw).events;
      }, space),
      readCanonical: () => peer.evaluate(peerSnapshotRequest, { method: "GET" }),
      writeCanonical: row => peer.evaluate(peerSnapshotRequest, { method: "PATCH", row }),
      close: () => peerContext.close()
    };
  } catch (error) {
    await peerContext.close();
    throw error;
  }
}

// Executes in the independent peer's document. Only the explicitly isolated
// mock origin is allowed; requests go through the existing fixture's CAS/ACK.
async function peerSnapshotRequest({ method, row }) {
  const configResponse = await fetch("/api/config");
  if (!configResponse.ok) throw new Error(`Synthetic config failed: ${configResponse.status}`);
  const config = await configResponse.json();
  if (config.storage?.mode !== "supabase" ||
      config.storage.url !== "https://personal-pins-qa.supabase.co") {
    throw new Error("Incoming test requires its isolated mock workspace transport");
  }
  const session = JSON.parse(localStorage.getItem("settle-friends-account-session") || "null");
  const space = session?.user?.user_metadata?.account_space_id;
  const key = session?.user?.user_metadata?.account_space_key;
  if (!space || !key || !session?.access_token) throw new Error("Synthetic peer session is missing");
  const url = new URL("/rest/v1/app_snapshots", config.storage.url);
  url.searchParams.set("id", `eq.${space}`);
  url.searchParams.set("select", method === "GET" ? "id,state,updated_at" : "updated_at");
  const headers = {
    apikey: config.storage.anonKey, authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json", "x-space-key": key, prefer: "return=representation"
  };
  const options = { method, headers };
  if (method === "PATCH") {
    if (row?.id !== space || !row.state || !row.updated_at) throw new Error("Invalid synthetic peer snapshot");
    url.searchParams.set("updated_at", `eq.${row.updated_at}`);
    options.body = JSON.stringify({ state: row.state, updated_at: new Date().toISOString() });
  }
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Synthetic peer ${method} failed: ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.updated_at) {
    throw new Error(`Synthetic peer ${method} did not return an acknowledgement`);
  }
  if (method === "GET" && (rows[0].id !== space || !Array.isArray(rows[0].state?.events))) {
    throw new Error("Synthetic peer read returned an invalid canonical snapshot");
  }
  return rows[0];
}
