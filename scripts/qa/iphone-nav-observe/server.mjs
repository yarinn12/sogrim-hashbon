import { createServer } from 'node:http';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Observation only: delegate the original handler without altering request,
// response, socket settings, error handling, headers or time budgets.
export function createObservedServer(handler, logPath) {
  const log = createWriteStream(logPath, { flags: 'wx' });
  const sockets = new WeakMap();
  const openSockets = new Set();
  let connection = 0, request = 0;
  const record = value => log.write(JSON.stringify({
    atUtc: new Date().toISOString(), monotonicNs: process.hrtime.bigint().toString(), ...value
  }) + '\n');
  const server = createServer((req, res) => {
    const id = ++request, connectionId = sockets.get(req.socket), start = process.hrtime.bigint();
    record({ kind: 'request', id, connectionId, method: req.method, url: req.url });
    res.on('finish', () => record({ kind: 'finish', id, connectionId, status: res.statusCode,
      elapsedMs: Number(process.hrtime.bigint() - start) / 1e6, complete: req.complete }));
    res.on('close', () => record({ kind: 'response-close', id, connectionId, finished: res.writableFinished }));
    req.on('aborted', () => record({ kind: 'request-aborted', id, connectionId }));
    return handler(req, res);
  });
  server.on('connection', socket => {
    const id = ++connection;
    sockets.set(socket, id);
    openSockets.add(socket);
    record({ kind: 'connection', connectionId: id });
    socket.on('close', hadError => {
      record({ kind: 'socket-close', connectionId: id, hadError });
      openSockets.delete(socket);
    });
    socket.on('timeout', () => record({ kind: 'socket-timeout', connectionId: id }));
  });
  server.on('listening', () => record({ kind: 'startup', pid: process.pid,
    address: server.address(), source: 'd7675a31fffa93699a1de65c9f786ab1ff619e30',
    observeOnly: true, keepAliveTimeout: server.keepAliveTimeout,
    headersTimeout: server.headersTimeout, requestTimeout: server.requestTimeout,
    maxRequestsPerSocket: server.maxRequestsPerSocket }));
  return { server, closeLog: async () => {
    // server.close's callback can precede the final socket close notification.
    // Drain observation callbacks before ending their stream; never alter sockets.
    await Promise.all([...openSockets].map(socket => once(socket, 'close')));
    await new Promise((accept, reject) => {
      log.once('error', reject);
      log.end(accept);
    });
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.SOGRIM_DIAGNOSTIC_APP_DIR;
  const logPath = process.env.SOGRIM_DIAGNOSTIC_HTTP_LOG;
  const port = Number(process.env.PW_QA_PORT);
  if (!root || !logPath || port !== 4186) throw new Error('Explicit synthetic app/log and original4186 port required');
  const { createAppHandler, resolveServerHost } = await import(pathToFileURL(resolve(root, 'server.mjs')).href);
  const { server } = createObservedServer(createAppHandler({ root, port }), logPath);
  server.listen(port, resolveServerHost(), () => console.log(`Observed original handler on port ${port}`));
}
