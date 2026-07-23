import { createHash, randomUUID } from "node:crypto";

const requiredVariables = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`Missing ${variable}`);
  }
}

const id = `qa-${randomUUID().replaceAll("-", "")}`;
const spaceKey = `${randomUUID()}${randomUUID()}`;
const accessKeyHash = createHash("sha256").update(spaceKey).digest("hex");
const endpoint = `${process.env.SUPABASE_URL}/rest/v1/app_snapshots`;
const publicHeaders = {
  apikey: process.env.SUPABASE_ANON_KEY,
  authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
};
const spaceHeaders = {
  ...publicHeaders,
  "content-type": "application/json",
  prefer: "return=representation",
  "x-space-key": spaceKey,
};

async function readRows(key) {
  const response = await fetch(`${endpoint}?id=eq.${id}&select=id,state`, {
    headers: { ...publicHeaders, "x-space-key": key },
  });
  return { response, rows: await response.json() };
}

try {
  const insert = await fetch(endpoint, {
    method: "POST",
    headers: spaceHeaders,
    body: JSON.stringify({
      id,
      access_key_hash: accessKeyHash,
      state: { test: true, version: 1 },
    }),
  });
  const wrongRead = await readRows(randomUUID());
  const correctRead = await readRows(spaceKey);
  const missingKeyInsert = await fetch(endpoint, {
    method: "POST",
    headers: { ...publicHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      id: `missing-${id}`,
      access_key_hash: accessKeyHash,
      state: { test: true },
    }),
  });
  const update = await fetch(`${endpoint}?id=eq.${id}`, {
    method: "PATCH",
    headers: spaceHeaders,
    body: JSON.stringify({ state: { test: true, version: 2 } }),
  });
  const updatedRead = await readRows(spaceKey);

  const result = {
    insertStatus: insert.status,
    wrongKeyRows: wrongRead.rows.length,
    correctKeyRows: correctRead.rows.length,
    missingKeyStatus: missingKeyInsert.status,
    updateStatus: update.status,
    updatedVersion: updatedRead.rows[0]?.state?.version,
  };
  console.log(JSON.stringify(result));

  const passed =
    [200, 201].includes(insert.status) &&
    wrongRead.response.ok &&
    wrongRead.rows.length === 0 &&
    correctRead.response.ok &&
    correctRead.rows.length === 1 &&
    missingKeyInsert.status >= 400 &&
    update.ok &&
    updatedRead.rows[0]?.state?.version === 2;

  if (!passed) {
    process.exitCode = 1;
  }
} finally {
  const serviceHeaders = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  await fetch(`${endpoint}?id=in.(${id},missing-${id})`, {
    method: "DELETE",
    headers: serviceHeaders,
  });
}
