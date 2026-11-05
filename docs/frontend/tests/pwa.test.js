import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicPath = new URL("../public/", import.meta.url);

test("PWA manifest declares an installable Vietnamese standalone app", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", publicPath), "utf8"));
  assert.equal(manifest.lang, "vi-VN");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose.includes("maskable")));

  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(icon.src.slice(1), publicPath));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), Number.parseInt(icon.sizes, 10));
  }
});

test("service worker excludes API requests from its static cache", async () => {
  const serviceWorker = await readFile(new URL("sw.js", publicPath), "utf8");
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(serviceWorker, /request\.mode === 'navigate'/);
});
