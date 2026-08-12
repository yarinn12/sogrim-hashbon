import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const packageFile = join(root, "ios", "App", "CapApp-SPM", "Package.swift");
const source = await readFile(packageFile, "utf8");
const normalized = source.replace(/path: "([^"]+)"/g, (match, packagePath) => {
  return `path: "${packagePath.replaceAll("\\", "/")}"`;
});

if (normalized !== source) {
  await writeFile(packageFile, normalized, "utf8");
}

await patchAndroidAdMobBannerContainer();

console.log("Native projects finalized for Android and macOS/Xcode builds.");

async function patchAndroidAdMobBannerContainer() {
  const bannerExecutorFile = join(
    root,
    "node_modules",
    "@capacitor-community",
    "admob",
    "android",
    "src",
    "main",
    "java",
    "com",
    "getcapacitor",
    "community",
    "admob",
    "banner",
    "BannerExecutor.java"
  );
  let bannerSource = await readFile(bannerExecutorFile, "utf8");

  if (!bannerSource.includes("clampBannerContainerToAdHeight();")) {
    bannerSource = bannerSource.replace(
      "public void onAdLoaded() {\n",
      "public void onAdLoaded() {\n                            clampBannerContainerToAdHeight();\n"
    );
  }

  if (
    !bannerSource.includes(
      "private void clampBannerContainerToAdHeight()"
    )
  ) {
    bannerSource = bannerSource.replace(
      "    private void updateExistingAdView(AdOptions adOptions) {",
      `    private void clampBannerContainerToAdHeight() {
        if (mAdView == null || mAdViewLayout == null) return;

        int adHeight = mAdView.getAdSize().getHeightInPixels(contextSupplier.get());
        if (adHeight <= 0) return;

        ViewGroup.LayoutParams layoutParams = mAdViewLayout.getLayoutParams();
        layoutParams.height = adHeight;
        mAdViewLayout.setLayoutParams(layoutParams);
        mAdViewLayout.requestLayout();
    }

    private void updateExistingAdView(AdOptions adOptions) {`
    );
  }

  if (!bannerSource.includes("bottomInset + densityMargin")) {
    bannerSource = bannerSource.replace(
      "            // set Safe Area only for Android 15+",
      `            int densityMargin = (int) (adOptions.margin * density);

            // set Safe Area only for Android 15+`
    );
    bannerSource = bannerSource.replace(
      "                        mAdViewLayoutParams.setMargins(0, topInset, 0, 0);",
      `                        mAdViewLayoutParams.setMargins(
                            mAdViewLayoutParams.leftMargin,
                            topInset + densityMargin,
                            mAdViewLayoutParams.rightMargin,
                            0
                        );`
    );
    bannerSource = bannerSource.replace(
      "                        mAdViewLayoutParams.setMargins(0, 0, 0, bottomInset);",
      `                        mAdViewLayoutParams.setMargins(
                            mAdViewLayoutParams.leftMargin,
                            0,
                            mAdViewLayoutParams.rightMargin,
                            bottomInset + densityMargin
                        );`
    );
    bannerSource = bannerSource.replace(
      "\n            int densityMargin = (int) (adOptions.margin * density);\n\n            // Center Banner Ads",
      "\n            // Center Banner Ads"
    );
  }

  await writeFile(bannerExecutorFile, bannerSource, "utf8");
}
