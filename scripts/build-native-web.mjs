import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { transform as transformCss } from "lightningcss";
import { loadEnvFile } from "../src/server/envFile.mjs";
import {
  getClientRuntimeConfig,
  getRuntimeConfig
} from "../src/server/runtimeConfig.mjs";
import {
  canonicalPublicOrigin,
  PUBLIC_ORIGIN,
  runtimeApiOrigins
} from "../src/domain/publicOrigin.mjs";
import { nativeRuntimeCompatibility } from "../src/domain/nativeRuntimeCompatibility.mjs";

const root = process.cwd();
const output = join(root, "www");
const buildEnv = { ...process.env };
loadEnvFile(join(root, ".env.local"), buildEnv, { loadPrivate: true });
loadEnvFile(join(root, ".env"), buildEnv);
const publicAppOrigin = canonicalPublicOrigin(
  buildEnv.APP_PUBLIC_URL,
  PUBLIC_ORIGIN
);
const publicFiles = [
  "index.html",
  "styles.css",
  "legal.css",
  "legal.mjs",
  "manifest.webmanifest",
  "brand-mark.png",
  "brand-mark-v3.png",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "app-icon-exterior-192.png",
  "app-icon-exterior-512.png",
  "app-icon-exterior-maskable-512.png",
  "apple-touch-icon.png",
  "sogrim-logo-lockup.png",
  "sogrim-share-logo.png",
  "sogrim-home-hero.png",
  "assets/sogrim-heshbon-loading-loop-v2.mp4",
  "assets/sogrim-logo-intro-poster.jpg",
  "assets/sogrim-logo-intro-hold.jpg",
  "assets/sign-in-with-apple-iw.png",
  "assets/avatars/avatar-1.png",
  "assets/avatars/avatar-2.png",
  "assets/avatars/avatar-3.png",
  "assets/avatars/avatar-4.png",
  "assets/avatars/avatar-5.png",
  "assets/avatars/avatar-6.png",
  "privacy.html",
  "support.html",
  "terms.html",
  "accessibility.html",
  "account-deletion.html",
  "sw.js"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(join(output, "assets"), { recursive: true });
await mkdir(join(output, "assets", "avatars"), { recursive: true });

for (const file of publicFiles) {
  await cp(join(root, file), join(output, file));
}

await cp(join(root, "src"), join(output, "src"), {
  recursive: true,
  filter(source) {
    return !source.includes(join("src", "server"));
  }
});

await bundleNativeModules();

console.log("Native web bundle is ready in www/.");

async function bundleNativeModules() {
  const indexPath = join(output, "index.html");
  const html = await readFile(indexPath, "utf8");
  const moduleTagPattern = /<script type="module" src="\.\/src\/([^"?]+\.mjs)(?:\?pwa_release=\d+)?"><\/script>/g;
  const moduleScripts = [...html.matchAll(moduleTagPattern)].map((match) => ({
    tag: match[0],
    path: `./src/${match[1]}`
  }));

  if (moduleScripts.length < 2) {
    throw new Error("Native module bundling expected multiple module entry scripts.");
  }

  const preludeNames = new Set([
    "./src/publicFontLoader.mjs",
    "./src/publicAppSplashLayer.mjs",
    "./src/publicMutationThrottleLayer.mjs"
  ]);
  const prelude = moduleScripts.filter((entry) => preludeNames.has(entry.path));
  const application = moduleScripts.filter((entry) => !preludeNames.has(entry.path));
  const appEntryIndex = application.findIndex((entry) => entry.path === "./src/app.mjs");
  const accountEndIndex = application.findIndex(
    (entry) => entry.path === "./src/publicProfileContextLayer.mjs"
  );
  if (appEntryIndex <= 0 || accountEndIndex <= appEntryIndex) {
    throw new Error("Native module groups could not locate the app and account boundaries.");
  }
  const authBootstrap = application.slice(0, appEntryIndex);
  const core = application.slice(appEntryIndex, appEntryIndex + 1);
  const account = application.slice(appEntryIndex + 1, accountEndIndex + 1);
  const experience = application.slice(accountEndIndex + 1);
  const assetsDir = join(output, "assets");
  const bootstrapConfig = await loadNativeBootstrapRuntimeConfig();
  const extractedCssPaths = await extractNativeStaticCss(moduleScripts, assetsDir);

  await Promise.all([
    bundleEntries(prelude, join(assetsDir, "native-prelude.mjs"), "native-prelude-entry.mjs", extractedCssPaths),
    bundleEntries(authBootstrap, join(assetsDir, "native-auth.mjs"), "native-auth-entry.mjs", extractedCssPaths),
    bundleEntries(core, join(assetsDir, "native-core.mjs"), "native-core-entry.mjs", extractedCssPaths),
    bundleEntries(account, join(assetsDir, "native-account.mjs"), "native-account-entry.mjs", extractedCssPaths),
    bundleEntries(experience, join(assetsDir, "native-experience.mjs"), "native-experience-entry.mjs", extractedCssPaths)
  ]);

  let nativeHtml = html;
  nativeHtml = nativeHtml.replace(
    "</head>",
    '    <link rel="preload" as="style" href="./assets/native-layers.css" />\n  </head>'
  );
  nativeHtml = nativeHtml.replace(
    /(<html\b[^>]*\bclass=")([^"]*)"/,
    "$1$2 native-styles-pending\""
  );
  nativeHtml = replaceModuleGroup(
    nativeHtml,
    prelude,
    '<script type="module" src="./assets/native-style-loader.mjs"></script>\n<script type="module" src="./assets/native-prelude.mjs"></script>'
  );
  nativeHtml = replaceModuleGroup(
    nativeHtml,
    authBootstrap,
    `${nativeBootstrapScript(bootstrapConfig)}\n<script type="module" src="./assets/native-auth.mjs"></script>`
  );
  nativeHtml = replaceModuleGroup(
    nativeHtml,
    core,
    '<script type="module" src="./assets/native-core.mjs"></script>'
  );
  nativeHtml = replaceModuleGroup(
    nativeHtml,
    account,
    '<script type="module" src="./assets/native-account.mjs"></script>'
  );
  nativeHtml = replaceModuleGroup(
    nativeHtml,
    experience,
    '<script type="module" src="./assets/native-experience.mjs"></script>'
  );
  await writeFile(indexPath, nativeHtml, "utf8");
}

async function loadNativeBootstrapRuntimeConfig() {
  const androidBuild = await readAndroidBuildCode();
  let remoteError = null;

  for (const apiBaseUrl of runtimeApiOrigins({ publicUrl: publicAppOrigin })) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${apiBaseUrl}/api/config`, {
        cache: "no-store",
        headers: {
          "X-Sogrim-Platform": "android",
          "X-Sogrim-App-Build": String(androidBuild)
        },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return {
        ...validateNativeBootstrapConfig(await response.json(), {
          expectedAndroidBuild: androidBuild
        }),
        publicUrl: publicAppOrigin,
        apiBaseUrl
      };
    } catch (error) {
      remoteError = error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  try {
    const config = getClientRuntimeConfig(
      getRuntimeConfig(buildEnv, publicAppOrigin),
      { platform: "android", build: androidBuild }
    );
    console.warn(
      `Native runtime bootstrap loaded from local environment after remote config failed: ${remoteError?.message ?? "unknown error"}`
    );
    return validateNativeBootstrapConfig(config, {
      expectedAndroidBuild: androidBuild
    });
  } catch (localError) {
    throw new Error(
      `Native runtime bootstrap is unavailable (remote: ${remoteError?.message ?? "unknown error"}; local: ${localError.message}). Refusing to build a disconnected store release.`
    );
  }
}

function validateNativeBootstrapConfig(config, options = {}) {
  const compatibility = nativeRuntimeCompatibility(config, options);
  if (!compatibility.ok) {
    throw new Error(`Native bootstrap config is incompatible: ${compatibility.reason}`);
  }

  const { account: _account, ...storage } = config.storage;
  return { ...config, storage };
}

async function readAndroidBuildCode() {
  const gradle = await readFile(join(root, "android", "app", "build.gradle"), "utf8");
  const build = Number.parseInt(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? "", 10);
  if (!Number.isSafeInteger(build) || build < 1) {
    throw new Error("Android versionCode could not be read for the native runtime config");
  }
  return build;
}

function nativeBootstrapScript(config) {
  if (!config) return "";
  const serialized = JSON.stringify(config).replaceAll("<", "\\u003c");
  return `<script>globalThis.SogrimNativeRuntimeConfig=Object.freeze(${serialized});</script>`;
}

async function bundleEntries(entries, outfile, sourcefile, extractedCssPaths) {
  if (!entries.length) throw new Error(`No native entries found for ${sourcefile}`);
  await build({
    stdin: {
      contents: entries.map((entry) => `import ${JSON.stringify(entry.path)};`).join("\n"),
      resolveDir: root,
      sourcefile
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    minify: true,
    legalComments: "none",
    plugins: [extractStaticCssTemplatesPlugin(extractedCssPaths)],
    outfile
  });
}

async function extractNativeStaticCss(entries, assetsDir) {
  const extractedPaths = new Set();
  const orderedCss = [];

  for (const entry of entries) {
    const sourcePath = resolve(root, entry.path);
    const source = await readFile(sourcePath, "utf8");
    const staticCss = [];
    source.replace(/const CSS = `([\s\S]*?)`;/g, (match, css) => {
      if (!css.includes("${")) staticCss.push(css);
      return match;
    });
    if (!staticCss.length) continue;

    extractedPaths.add(sourcePath);
    for (const css of staticCss) {
      const result = transformCss({
        filename: `${sourcePath}.css`,
        code: Buffer.from(css),
        minify: true
      });
      orderedCss.push(result.code.toString());
    }
  }

  if (!orderedCss.length) {
    throw new Error("Native CSS extraction did not find any static layer styles.");
  }
  await writeFile(
    join(assetsDir, "native-layers.css"),
    `${orderedCss.join("\n")}\n`,
    "utf8"
  );
  await writeFile(
    join(assetsDir, "native-style-loader.mjs"),
    nativeStyleLoaderSource(),
    "utf8"
  );
  return extractedPaths;
}

function nativeStyleLoaderSource() {
  return `const root = document.documentElement;
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "./assets/native-layers.css";
stylesheet.media = "print";
stylesheet.dataset.nativeLayers = "true";
let completed = false;
const complete = () => {
  if (completed) return;
  completed = true;
  root.classList.remove("native-styles-pending");
  document.dispatchEvent(new Event("sogrim:native-styles-ready"));
};
stylesheet.addEventListener("load", () => {
  stylesheet.media = "all";
  requestAnimationFrame(() => requestAnimationFrame(complete));
}, { once: true });
stylesheet.addEventListener("error", complete, { once: true });
document.head.append(stylesheet);
`;
}

function extractStaticCssTemplatesPlugin(extractedCssPaths) {
  return {
    name: "extract-static-css-templates",
    setup(context) {
      context.onLoad({ filter: /public.*Layer\.mjs$/ }, async ({ path }) => {
        const source = await readFile(path, "utf8");
        if (!extractedCssPaths.has(resolve(path))) {
          return { contents: source, loader: "js" };
        }
        const contents = source.replace(
          /const CSS = `([\s\S]*?)`;/g,
          (match, css) => {
            if (css.includes("${")) return match;
            return 'const CSS = "";';
          }
        );
        return { contents, loader: "js" };
      });
    }
  };
}

function replaceModuleGroup(html, entries, replacement) {
  let replaced = false;
  return entries.reduce((result, entry) => {
    const next = replaced ? "" : replacement;
    replaced = true;
    return result.replace(entry.tag, next);
  }, html);
}
