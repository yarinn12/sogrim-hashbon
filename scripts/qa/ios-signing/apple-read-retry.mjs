import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

// Only idempotent build-readiness GETs may be retried. Mutations never enter here.
export async function readAppleReadiness(request, path, {sleep = delay} = {}) {
  assert.ok(/^\/v1\/apps\/[0-9]+$/.test(path) || path.startsWith('/v1/builds?'), 'Unexpected readiness GET path');
  for (let attempt = 0; ; attempt++) {
    try {
      return await request(path, {method: 'GET'});
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError' && error.status === undefined;
      if (attempt >= 2 || (![500, 502, 503, 504].includes(error?.status) && !timedOut)) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
}
