import { getClientRuntimeConfig, getRuntimeConfig } from "../../../src/server/runtimeConfig.mjs";

// Only injected into the QA build process. No network, credentials or product edits.
const config = getClientRuntimeConfig(getRuntimeConfig({
  APP_PUBLIC_URL: "https://sogrim-hesbon-app.vercel.app",
  SUPABASE_URL: "https://android-native-qa.supabase.co",
  SUPABASE_ANON_KEY: "synthetic-android-native-anon",
  GOOGLE_CLIENT_ID: "synthetic-android.apps.googleusercontent.com",
  AUTH_EMAIL_DELIVERY_READY: "1",
}, "https://sogrim-hesbon-app.vercel.app"), { platform: "android", build: 187 });
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.pathname !== "/api/config") throw new Error(`QA build refuses network: ${url.origin}${url.pathname}`);
  return new Response(JSON.stringify(config), { headers: { "content-type": "application/json" } });
};
