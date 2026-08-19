import test from "node:test";
import assert from "node:assert/strict";

import {
  compactQrInviteUrl,
  createQrMatrix,
  createQrSvg
} from "../src/domain/qrCode.mjs";

test("createQrMatrix renders a deterministic QR matrix with finder patterns", () => {
  const url = "https://sogrim-hesbon-app.vercel.app/?event=event-123";
  const first = createQrMatrix(url);
  const second = createQrMatrix(url);

  assert.equal(first.size, second.size);
  assert.deepEqual(first.modules, second.modules);
  assert.equal(first.modules.length, first.size);
  assert.equal(first.modules[0].length, first.size);
  assert.equal(first.modules[0][0], true);
  assert.equal(first.modules[0][first.size - 7], true);
  assert.equal(first.modules[first.size - 7][0], true);
});

test("createQrSvg returns a safe standalone SVG for an invite link", () => {
  const svg = createQrSvg("https://sogrim-hesbon-app.vercel.app/?event=event-123", {
    cellSize: 3,
    quietZone: 3
  });

  assert.match(svg, /^<svg /);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<path d="M\d+ \d+h3v3h-3z/);
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  assert.doesNotMatch(svg, /<script/i);
});

test("QR uses a compact cloud invite while copied links keep their full fallback", () => {
  const fullInvite =
    "https://sogrim-hesbon-app.vercel.app/?event=event-1&space=space-1&key=abcdefghijklmnopqrstuvwxyzABCDEF&invite=large-snapshot&ref=0123456789abcdefabcd";
  const compactInvite = compactQrInviteUrl(fullInvite);

  assert.equal(
    compactInvite,
    "https://sogrim-hesbon-app.vercel.app/i/event-1/space-1/abcdefghijklmnopqrstuvwxyzABCDEF?ref=0123456789abcdefabcd"
  );
  assert.doesNotMatch(compactInvite, /invite=/);
  assert.ok(compactInvite.length < fullInvite.length);
});

test("QR keeps the snapshot when no cloud access is available", () => {
  const snapshotInvite =
    "https://sogrim-hesbon-app.vercel.app/?event=event-1&invite=offline-snapshot";

  assert.equal(compactQrInviteUrl(snapshotInvite), snapshotInvite);
});
