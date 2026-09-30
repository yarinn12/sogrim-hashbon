import { createPrivateKey, sign } from "node:crypto";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const BUNDLE_ID = "com.sogrimhashbon.app";

export function createAppStoreToken({ issuerId, keyId, privateKey }, time = Date.now()) {
  if (!/^[a-f\d-]{36}$/i.test(issuerId ?? "") || !/^[A-Z\d]{10}$/.test(keyId ?? "")) {
    throw new Error("App Store Connect issuer or key ID is missing or invalid.");
  }
  let key;
  try {
    key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error();
  } catch {
    throw new Error("App Store Connect requires a valid P-256 private key.");
  }
  const seconds = Math.floor(time / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({
    iss: issuerId, aud: "appstoreconnect-v1", iat: seconds - 30, exp: seconds + 600
  })}`;
  return `${unsigned}.${sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

export function createAppStoreClient(credentials, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  return async function request(path, { method = "GET", body } = {}) {
    const url = new URL(path, API_ORIGIN);
    if (url.origin !== API_ORIGIN || !url.pathname.startsWith("/v1/") || url.username || url.password) {
      throw new Error("Unexpected App Store Connect API destination.");
    }
    // Processing can outlive an API token. Sign each request, including read-back
    // and the single authentication retry, rather than caching the upload token.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = createAppStoreToken(credentials, now());
      const response = await fetchImpl(url, {
        method, redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (response.status === 401 && attempt === 0) {
        await response.text();
        continue;
      }
      if (!response.ok) {
        // Error bodies may echo submitted metadata; never log them or credentials.
        await response.text();
        const error = new Error(`App Store Connect ${method} ${url.pathname} failed (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return response.status === 204 ? null : response.json();
    }
  };
}

function collection(result, label) {
  if (!Array.isArray(result?.data) || result.links?.next) {
    throw new Error(`Incomplete ${label} response from App Store Connect.`);
  }
  return result.data;
}

export async function completeTestFlightRelease({
  request, version, build, releaseNotes, attempts = 60, delayMs = 30_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {}
}) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version ?? "") || !/^\d+$/.test(build ?? "")) {
    throw new Error("An explicit iOS version and build number are required.");
  }
  const notes = String(releaseNotes ?? "").trim();
  if (!notes || notes.length > 4000) throw new Error("Hebrew TestFlight release notes must contain 1–4000 characters.");
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 120 || !Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("Invalid processing wait bounds.");
  }
  const apps = collection(await request(`/v1/apps?${new URLSearchParams({ "filter[bundleId]": BUNDLE_ID, limit: "2" })}`), "app lookup");
  if (apps.length !== 1 || apps[0].attributes?.bundleId !== BUNDLE_ID || !apps[0].id) {
    throw new Error("App Store Connect app identity does not match the release.");
  }
  const appId = apps[0].id;
  const query = new URLSearchParams({
    "filter[app]": appId, "filter[version]": build, "filter[preReleaseVersion.platform]": "IOS",
    include: "preReleaseVersion", limit: "200"
  });
  let target;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await request(`/v1/builds?${query}`);
    const builds = collection(response, "build lookup");
    if (builds.length > 1) throw new Error("Ambiguous App Store Connect build lookup.");
    target = builds[0];
    if (target) {
      const preRelease = response.included?.find((item) => item.type === "preReleaseVersions" && item.id === target.relationships?.preReleaseVersion?.data?.id);
      if (!target.id || target.attributes?.version !== build || preRelease?.attributes?.version !== version || preRelease.attributes.platform !== "IOS") {
        throw new Error("App Store Connect build version or platform does not match the release.");
      }
      const state = target.attributes.processingState;
      if (state === "VALID") break;
      if (state !== "PROCESSING") throw new Error(`Apple build processing failed: ${state || "missing state"}.`);
    }
    if (attempt === attempts - 1) throw new Error(`Timed out waiting for iOS ${version} (${build}) to become VALID.`);
    log(`Waiting for iOS ${version} (${build}) processing (${attempt + 1}/${attempts}).`);
    await sleep(delayMs);
  }
  if (target.attributes.usesNonExemptEncryption !== false) {
    throw new Error("Apple has not confirmed the signed app's encryption declaration.");
  }

  const path = `/v1/builds/${encodeURIComponent(target.id)}/betaBuildLocalizations?limit=200`;
  const readHebrew = async () => {
    const locales = collection(await request(path), "build localizations");
    const matches = locales.filter((item) => item.attributes?.locale === "he");
    if (matches.length > 1) throw new Error("Duplicate Hebrew build localizations.");
    return matches[0];
  };
  let hebrew = await readHebrew();
  if (!hebrew) {
    try {
      await request("/v1/betaBuildLocalizations", { method: "POST", body: {
        data: { type: "betaBuildLocalizations", attributes: { locale: "he", whatsNew: notes },
          relationships: { build: { data: { type: "builds", id: target.id } } } }
      } });
    } catch (error) {
      if (error.status !== 409) throw error;
      hebrew = await readHebrew();
      if (!hebrew) throw error;
    }
  }
  if (hebrew && hebrew.attributes.whatsNew !== notes) {
    if (!hebrew.id) throw new Error("Missing Hebrew build localization ID.");
    await request(`/v1/betaBuildLocalizations/${encodeURIComponent(hebrew.id)}`, { method: "PATCH", body: {
      data: { type: "betaBuildLocalizations", id: hebrew.id, attributes: { whatsNew: notes } }
    } });
  }
  const confirmed = await readHebrew();
  if (confirmed?.attributes?.whatsNew !== notes) throw new Error("Hebrew TestFlight release notes were not confirmed after saving.");
  return { appId, buildId: target.id, version, build, processingState: "VALID", hebrewReleaseNotesVerified: true };
}
