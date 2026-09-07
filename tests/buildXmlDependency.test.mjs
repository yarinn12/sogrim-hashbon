import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
import plist from "plist";

// GHSA-6gmq-8vp8-gcm6: exercise the installed transitive build dependency,
// not a copied parser. Post-creation mutation also bypasses a creation-only guard.
for (const invalidName of ["safe; <injected/> &x", "x y", "x<injected"]) {
  test(`build XML serializer rejects a malformed entity reference: ${invalidName}`, () => {
    const doc = new DOMImplementation().createDocument(null, "root", null);
    const ref = doc.createEntityReference("safe");
    ref.nodeName = invalidName;
    assert.throws(() => new XMLSerializer().serializeToString(ref, { requireWellFormed: true }));
  });
}

test("build XML serializer retains valid entity references and text escaping", () => {
  const doc = new DOMImplementation().createDocument(null, "root", null);
  const serializer = new XMLSerializer();
  assert.equal(serializer.serializeToString(doc.createEntityReference("valid"), { requireWellFormed: true }), "&valid;");
  doc.documentElement.appendChild(doc.createTextNode("בדיקה < & >"));
  assert.equal(serializer.serializeToString(doc), "<root>בדיקה &lt; &amp; &gt;</root>");
});

test("Capacitor plist consumer preserves the iOS configuration and ordinary values", () => {
  const current = plist.parse(readFileSync(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8"));
  const value = { ...current, testValues: [true, false, 123, "עברית", "$(CAPACITOR_DEBUG)", "a < b & c"] };
  assert.deepEqual(plist.parse(plist.build(value)), value);
});
