import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createAppHandler } from "../server.mjs";
import {
  invitePageMetadata,
  renderInviteDocument
} from "../src/server/invitePageMetadata.mjs";

const template = `<!doctype html>
<title>סוגרים חשבון</title>
<meta name="description" content="ברירת מחדל" />
<meta property="og:title" content="סוגרים חשבון" />
<meta property="og:description" content="ברירת מחדל" />
<meta name="twitter:title" content="סוגרים חשבון" />
<meta name="twitter:description" content="ברירת מחדל" />`;

test("invite metadata gives compact cloud links a trustworthy preview", () => {
  const metadata = invitePageMetadata(
    "https://sogrim-hashbon.vercel.app/?event=event-1&space=space-1&key=private-key"
  );

  assert.equal(metadata.title, "הזמנה לאירוע | סוגרים חשבון");
  assert.match(metadata.description, /מצטרפים לאירוע/);
});

test("invite metadata uses the event name from a safe snapshot", () => {
  const url = new URL("https://sogrim-hashbon.vercel.app/");
  url.searchParams.set("event", "event-1");
  url.searchParams.set("invite", JSON.stringify({
    version: 2,
    participants: [],
    groups: [],
    event: {
      id: "event-1",
      name: 'ארוחת צוות <חמישי>',
      eventType: "restaurant",
      participantIds: []
    }
  }));

  const document = renderInviteDocument(template, url);

  assert.match(document, /הוזמנת ל־ארוחת צוות &lt;חמישי&gt; \| סוגרים חשבון/);
  assert.match(document, /פותחים את האירוע &quot;ארוחת צוות &lt;חמישי&gt;&quot;/);
  assert.doesNotMatch(document, /private-key/);
});

test("ordinary pages keep the default document metadata", () => {
  assert.equal(renderInviteDocument(template, "https://sogrim-hashbon.vercel.app/"), template);
});

test("compact invite metadata uses the app logo without exposing its access key", () => {
  const socialTemplate = `<!doctype html>
<title>Default</title>
<meta name="description" content="Default" />
<meta property="og:title" content="Default" />
<meta property="og:description" content="Default" />
<meta property="og:url" content="https://sogrim-hashbon.vercel.app/" />
<meta property="og:image" content="https://sogrim-hashbon.vercel.app/sogrim-home-hero.png" />
<meta property="og:image:secure_url" content="https://sogrim-hashbon.vercel.app/sogrim-home-hero.png" />
<meta property="og:image:width" content="1672" />
<meta property="og:image:height" content="941" />
<meta property="og:image:alt" content="Default" />
<meta name="twitter:title" content="Default" />
<meta name="twitter:description" content="Default" />
<meta name="twitter:image" content="https://sogrim-hashbon.vercel.app/sogrim-home-hero.png" />`;
  const url = "https://sogrim-hashbon.vercel.app/i/event-1/space-party/abcdefghijklmnopqrstuvwxyzABCDEF";
  const document = renderInviteDocument(socialTemplate, url);

  assert.match(document, /property="og:image" content="https:\/\/sogrim-hashbon\.vercel\.app\/sogrim-share-logo\.png"/);
  assert.match(document, /property="og:image:width" content="1200"/);
  assert.match(document, /property="og:image:height" content="630"/);
  assert.match(document, /property="og:url" content="https:\/\/sogrim-hashbon\.vercel\.app\/"/);
  assert.doesNotMatch(document, /abcdefghijklmnopqrstuvwxyzABCDEF/);
});

test("the server serves compact invite paths with WhatsApp logo metadata", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/i/event-1/space-party/abcdefghijklmnopqrstuvwxyzABCDEF`
    );
    const document = await response.text();

    assert.equal(response.status, 200);
    assert.match(document, /<base href="\/"/);
    assert.match(document, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/sogrim-share-logo\.png"/);
    assert.doesNotMatch(document, /abcdefghijklmnopqrstuvwxyzABCDEF/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("the server returns event-aware metadata for a real invite request", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const url = new URL(`http://127.0.0.1:${port}/`);
    url.searchParams.set("event", "event-1");
    url.searchParams.set("invite", JSON.stringify({
      version: 2,
      participants: [],
      groups: [],
      event: {
        id: "event-1",
        name: "ארוחת שישי",
        eventType: "restaurant",
        participantIds: []
      }
    }));

    const response = await fetch(url);
    const document = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.match(document, /<title>הוזמנת ל־ארוחת שישי \| סוגרים חשבון<\/title>/);
    assert.match(document, /property="og:title" content="הוזמנת ל־ארוחת שישי \| סוגרים חשבון"/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
