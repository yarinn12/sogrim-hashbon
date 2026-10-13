export function productionRequestOptions(url, { headers = {}, trustedDeploymentUrl, bypassSecret } = {}) {
  const output = { ...headers };
  for (const key of Object.keys(output)) if (key.toLowerCase() === "x-vercel-protection-bypass") delete output[key];
  const target = new URL(url);
  const trusted = trustedDeploymentUrl ? new URL(trustedDeploymentUrl) : null;
  const attach = Boolean(bypassSecret && trusted && trusted.protocol === "https:" &&
    trusted.hostname.endsWith(".vercel.app") && target.origin === trusted.origin);
  if (attach) output["x-vercel-protection-bypass"] = bypassSecret;
  return { headers: output, redirect: attach ? "manual" : "follow" };
}
