import test from "node:test";
import assert from "node:assert/strict";

import { getLanUrls } from "../src/server/networkInfo.mjs";

test("getLanUrls returns non-internal IPv4 URLs for the app port", () => {
  const urls = getLanUrls(4173, {
    WiFi: [
      { family: "IPv4", address: "192.168.1.40", internal: false },
      { family: "IPv6", address: "fe80::1", internal: false }
    ],
    Loopback: [{ family: "IPv4", address: "127.0.0.1", internal: true }]
  });

  assert.deepEqual(urls, ["http://192.168.1.40:4173"]);
});

test("getLanUrls skips common virtual adapters", () => {
  const urls = getLanUrls(4173, {
    "vEthernet (Default Switch)": [
      { family: "IPv4", address: "192.168.56.1", internal: false }
    ],
    "VirtualBox Host-Only Network": [
      { family: "IPv4", address: "192.168.183.1", internal: false }
    ],
    Ethernet: [{ family: "IPv4", address: "192.168.1.41", internal: false }]
  });

  assert.deepEqual(urls, ["http://192.168.1.41:4173"]);
});

test("getLanUrls prefers client-like addresses when Windows names virtual adapters as Ethernet", () => {
  const urls = getLanUrls(4173, {
    Ethernet: [{ family: "IPv4", address: "192.168.1.21", internal: false }],
    "Ethernet 2": [{ family: "IPv4", address: "192.168.56.1", internal: false }],
    "Ethernet 3": [{ family: "IPv4", address: "192.168.121.2", internal: false }]
  });

  assert.deepEqual(urls, ["http://192.168.1.21:4173"]);
});

test("getLanUrls returns an empty list when no LAN address exists", () => {
  const urls = getLanUrls(4173, {
    Loopback: [{ family: "IPv4", address: "127.0.0.1", internal: true }]
  });

  assert.deepEqual(urls, []);
});
