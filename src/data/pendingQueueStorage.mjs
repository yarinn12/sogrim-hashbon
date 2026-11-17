// An unread durable queue is different from an empty queue. Readers may show
// an empty view temporarily, but mutations must retain the existing bytes.
export function readPendingQueueEntries(storage, key, normalizeEntry) {
  try {
    if (typeof storage?.getItem !== "function") return null;
    const parsed = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeEntry).filter(Boolean) : null;
  } catch {
    return null;
  }
}
