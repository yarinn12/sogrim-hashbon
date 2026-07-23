import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "www");
const publicFiles = [
  "index.html",
  "styles.css",
  "legal.css",
  "manifest.webmanifest",
  "brand-mark.png",
  "brand-mark-v3.png",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
  "sogrim-logo-lockup.png",
  "sogrim-share-logo.png",
  "sogrim-home-hero.png",
  "assets/sogrim-logo-intro.mp4",
  "assets/sogrim-logo-intro-poster.jpg",
  "privacy.html",
  "support.html",
  "terms.html",
  "account-deletion.html",
  "sw.js"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(join(output, "assets"), { recursive: true });

for (const file of publicFiles) {
  await cp(join(root, file), join(output, file));
}

await cp(join(root, "src"), join(output, "src"), {
  recursive: true,
  filter(source) {
    return !source.includes(join("src", "server"));
  }
});

console.log("Native web bundle is ready in www/.");
