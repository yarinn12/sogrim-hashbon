export async function loadCloudState(config, fallbackState, fetchImpl = fetch) {
  if (config.storage?.mode !== "supabase") return fallbackState;

  const response = await fetchImpl(snapshotReadUrl(config), {
    headers: cloudHeaders(config)
  });

  if (!response.ok) throw new Error("Cloud state unavailable");

  const rows = await response.json();
  const state = rows[0]?.state;
  if (state) return state;

  await saveCloudState(config, fallbackState, fetchImpl);
  return fallbackState;
}

export async function saveCloudState(config, state, fetchImpl = fetch) {
  if (config.storage?.mode !== "supabase") return;

  const response = await fetchImpl(snapshotWriteUrl(config), {
    method: "POST",
    headers: {
      ...cloudHeaders(config),
      prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      id: config.storage.spaceId,
      state
    })
  });

  if (!response.ok) throw new Error("Cloud state save failed");
}

function snapshotReadUrl(config) {
  return `${snapshotWriteUrl(config)}?id=eq.${encodeURIComponent(config.storage.spaceId)}&select=state`;
}

function snapshotWriteUrl(config) {
  return `${config.storage.url}/rest/v1/${encodeURIComponent(config.storage.table)}`;
}

function cloudHeaders(config) {
  return {
    apikey: config.storage.anonKey,
    authorization: `Bearer ${config.storage.anonKey}`,
    "content-type": "application/json"
  };
}
