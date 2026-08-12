export const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

export async function fetchWithTimeout(
  fetchImpl,
  url,
  options = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const upstreamSignal = options.signal;
  let removeAbortListener = null;

  if (upstreamSignal) {
    const abortFromUpstream = () => controller.abort(upstreamSignal.reason);
    if (upstreamSignal.aborted) {
      abortFromUpstream();
    } else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
      removeAbortListener = () =>
        upstreamSignal.removeEventListener("abort", abortFromUpstream);
    }
  }

  let timeoutId;
  const timeoutError = new Error("Network request timed out");
  timeoutError.code = "NETWORK_TIMEOUT";
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, Math.max(1, Number(timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS));
  });

  try {
    const request = Promise.resolve().then(() => {
      if (controller.signal.aborted) {
        throw controller.signal.reason ?? new Error("Network request aborted");
      }
      return fetchImpl(url, {
        ...options,
        signal: controller.signal
      });
    });
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timeoutId);
    removeAbortListener?.();
  }
}
