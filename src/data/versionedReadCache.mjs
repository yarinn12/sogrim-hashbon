// Cache only confirmed server payloads. Callers must recheck both authorization
// and the server version before reuse; this is not a time-based/offline cache.
export function createScopedReadCache({ maxEntries = 128, maxBytes = 8_000_000 } = {}) {
  let activeScope = "";
  let activeTransport;
  let activeCache;
  return (config, transport) => {
    const storage = config?.storage;
    const account = storage?.account;
    const scope = storage?.mode === "supabase" && account?.userId && account?.accessToken
      ? JSON.stringify([storage.url, storage.table, storage.anonKey, account.userId, account.accessToken])
      : "";
    if (!scope) {
      activeScope = "";
      activeCache = null;
      return null;
    }
    if (scope !== activeScope || transport !== activeTransport) {
      activeScope = scope;
      activeTransport = transport;
      // In-flight reads retain their old cache object, so a late account-A
      // response cannot populate account B's cache after an account switch.
      activeCache = boundedCache(maxEntries, maxBytes);
    }
    return activeCache;
  };
}

function boundedCache(maxEntries, maxBytes) {
  const entries = new Map();
  let bytes = 0;
  function remove(key) {
    bytes -= entries.get(key)?.bytes ?? 0;
    entries.delete(key);
  }
  return {
    has(key) { return entries.has(key); },
    hasPrefix(prefix) { return [...entries.keys()].some((key) => key.startsWith(prefix)); },
    get(key, version) {
      const entry = entries.get(key);
      if (!entry || !version || entry.version !== version) return null;
      entries.delete(key);
      entries.set(key, entry);
      return JSON.parse(entry.json);
    },
    version(key) { return entries.get(key)?.version ?? ""; },
    set(key, version, value) {
      remove(key);
      if (!version || value == null) return;
      const json = JSON.stringify(value);
      const entryBytes = json.length * 2; // Conservative UTF-16 text budget.
      if (entryBytes > maxBytes || maxEntries < 1) return;
      while (entries.size >= maxEntries || bytes + entryBytes > maxBytes) {
        remove(entries.keys().next().value);
      }
      entries.set(key, { version, json, bytes: entryBytes });
      bytes += entryBytes;
    },
    remove,
    retain(prefix, keys) {
      for (const key of entries.keys()) {
        if (key.startsWith(prefix) && !keys.has(key)) remove(key);
      }
    }
  };
}
