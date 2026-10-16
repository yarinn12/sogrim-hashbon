function responseSummary(path, text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { json: false, bytes: Buffer.byteLength(text) };
  }
  if (path === "/api/reset") {
    return {
      json: true,
      events: Array.isArray(body?.events) ? body.events.length : null,
      participants: Array.isArray(body?.participants) ? body.participants.length : null
    };
  }
  if (path === "/api/health") {
    return { json: true, ok: body?.ok === true,
      storageMode: String(body?.storageMode ?? "").slice(0, 40) };
  }
  return {
    json: true,
    ok: body?.ok === true,
    code: String(body?.code ?? "").slice(0, 80),
    error: String(body?.error ?? "").slice(0, 160)
  };
}

async function probeHealth(request, requestId) {
  const startedAt = new Date().toISOString();
  try {
    const response = await request.get("/api/health", {
      headers: { "x-sogrim-request-id": `${requestId}-health`, connection: "close" },
      timeout: 2_000
    });
    const body = responseSummary("/api/health", await response.text());
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      status: response.status(),
      requestId: response.headers()["x-sogrim-request-id"] ?? "",
      body
    };
  } catch (error) {
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      error: { name: String(error?.name ?? "Error"), message: String(error?.message ?? error).slice(0, 500) }
    };
  }
}

export async function recordQaStateBoundary({ request, testInfo, scenario, engine, phase, method, path, data }) {
  const requestId = `font-${scenario}-${engine}-${phase}`;
  const startedMs = Date.now();
  const evidence = { scenario, engine, phase, method: method.toUpperCase(), path, requestId,
    startedAt: new Date(startedMs).toISOString() };
  const attach = () => testInfo.attach(`qa-state-${scenario}-${engine}-${phase}`, {
    body: JSON.stringify(evidence, null, 2), contentType: "application/json"
  });

  let response;
  try {
    response = await request[method](path, {
      // Each QA mutation has its own acknowledged HTTP boundary. Do not reuse
      // an idle socket that the local server may have closed between engines.
      headers: { "x-sogrim-request-id": requestId, connection: "close" },
      ...(data === undefined ? {} : { data })
    });
    evidence.status = response.status();
    evidence.responseRequestId = response.headers()["x-sogrim-request-id"] ?? "";
    evidence.body = responseSummary(path, await response.text());
    if (!response.ok()) throw new Error(`${phase} returned HTTP ${evidence.status}`);
    if (path === "/api/reset" &&
        (!Number.isInteger(evidence.body.events) || !Number.isInteger(evidence.body.participants))) {
      throw new Error("reset did not acknowledge a state snapshot");
    }
    if (path === "/api/state" && evidence.body.ok !== true) {
      throw new Error("state write did not acknowledge ok:true");
    }
  } catch (error) {
    evidence.finishedAt = new Date().toISOString();
    evidence.durationMs = Date.now() - startedMs;
    evidence.failure = {
      name: String(error?.name ?? "Error"),
      message: String(error?.message ?? error).slice(0, 500)
    };
    evidence.health = await probeHealth(request, requestId);
    try {
      await attach();
    } catch (attachmentError) {
      throw new AggregateError([error, attachmentError], `${phase} failed and its QA evidence could not be attached`);
    }
    throw error;
  }
  evidence.finishedAt = new Date().toISOString();
  evidence.durationMs = Date.now() - startedMs;
  await attach();
  return response;
}
