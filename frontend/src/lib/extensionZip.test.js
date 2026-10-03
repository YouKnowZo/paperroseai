import { test } from "node:test";
import assert from "node:assert/strict";
import { createExtensionZip } from "./extensionZip.js";

test("creates a valid deterministic ZIP with uncompressed extension files", async () => {
  const a = Buffer.from(await createExtensionZip([{ name: "manifest.json", content: "{}" }, { name: "popup.js", content: "void 0;" }]).arrayBuffer());
  const b = Buffer.from(await createExtensionZip([{ name: "manifest.json", content: "{}" }, { name: "popup.js", content: "void 0;" }]).arrayBuffer());
  assert.deepEqual(a, b);
  assert.equal(a.readUInt32LE(0), 0x04034b50);
  assert.equal(a.readUInt32LE(a.length - 22), 0x06054b50);
  assert.equal(a.readUInt16LE(a.length - 12), 2);
});
test("refuses invalid, empty, excessive, or unsafe archive entries", () => {
  assert.throws(() => createExtensionZip([]));
  assert.throws(() => createExtensionZip([{ name: "../manifest.json", content: "{}" }]));
  assert.throws(() => createExtensionZip(Array.from({ length: 33 }, (_, i) => ({ name: `${i}.txt`, content: "" }))));
});
