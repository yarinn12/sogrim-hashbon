import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const sourcePath = join(root, "docs", "store-assets", "app-icon-1024.png");
const iosPath = join(
  root,
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "AppIcon.appiconset",
  "AppIcon-512@2x.png"
);

const source = await readFile(sourcePath);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

if (!source.subarray(0, 8).equals(pngSignature)) {
  throw new Error("The App Store icon must be a PNG file.");
}
if (source.readUInt32BE(16) !== 1024 || source.readUInt32BE(20) !== 1024) {
  throw new Error("The App Store icon must be exactly 1024x1024 pixels.");
}
if (source[24] !== 8 || source[25] !== 2) {
  throw new Error("The App Store icon must be an opaque 8-bit RGB PNG without an alpha channel.");
}

await copyFile(sourcePath, iosPath);
console.log("App Store icon is valid and synced to the iOS asset catalog.");
