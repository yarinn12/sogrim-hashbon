import { request as httpRequest } from 'node:http';

// Read the real local entry document for held-resource fixtures, independently
// of Playwright's shared keep-alive pool. Never replay or redirect a request.
export async function readLocalQaHtmlFresh(baseURL, path = '/') {
  const base = new URL(baseURL), target = new URL(path, base);
  if (target.protocol !== 'http:' || target.origin !== base.origin || target.username || target.password ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.pathname !== '/' || target.hash) {
    throw new Error('QA HTML requires the same local loopback root');
  }
  return new Promise((resolve, reject) => {
    const request = httpRequest(target, { method: 'GET', agent: false, signal: AbortSignal.timeout(30_000) }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 1_000_000) response.destroy(new Error('QA HTML body is too large')); else chunks.push(chunk); });
      response.once('error', reject);
      response.once('aborted', () => reject(new Error('QA HTML response aborted')));
      response.once('close', () => { if (!response.complete) reject(new Error('QA HTML closed before acknowledgement')); });
      response.once('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`QA HTML failed with HTTP ${response.statusCode}`));
        if (!String(response.headers['content-type'] || '').startsWith('text/html')) return reject(new Error('QA HTML returned an unexpected document type'));
        const headers = Object.fromEntries(Object.entries(response.headers)
          .filter(([key, value]) => value !== undefined && !['connection', 'keep-alive', 'transfer-encoding', 'content-length'].includes(key))
          .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]));
        resolve({ status: 200, headers, body: Buffer.concat(chunks) });
      });
    });
    request.once('error', reject); request.end();
  });
}
