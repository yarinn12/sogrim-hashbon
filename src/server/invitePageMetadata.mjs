import {
  parseInviteEventId,
  parseInviteSnapshot
} from "../domain/inviteLinks.mjs";

const APP_NAME = "סוגרים חשבון";

export function invitePageMetadata(urlValue) {
  const url = toUrl(urlValue);
  if (!url || !parseInviteEventId(url.toString())) return null;

  const snapshot = parseInviteSnapshot(url.toString());
  const eventName = previewText(snapshot?.event?.name, 52);

  const metadata = {
    title: eventName
      ? `הוזמנת ל־${eventName} | ${APP_NAME}`
      : `הזמנה לאירוע | ${APP_NAME}`,
    description: eventName
      ? `פותחים את האירוע "${eventName}", מצטרפים ורואים יחד מי שילם וכמה.`
      : "פותחים את ההזמנה, מצטרפים לאירוע וסוגרים יחד את החשבון."
  };
  metadata.image = new URL("/sogrim-share-logo.png", url).toString();
  metadata.canonicalUrl = new URL("/", url).toString();
  return metadata;
}

export function renderInviteDocument(template, urlValue) {
  const metadata = invitePageMetadata(urlValue);
  if (!metadata) return template;

  let document = replaceTitle(template, metadata.title);
  document = replaceMetaContent(document, "name", "description", metadata.description);
  document = replaceMetaContent(document, "property", "og:title", metadata.title);
  document = replaceMetaContent(document, "property", "og:description", metadata.description);
  document = replaceMetaContent(document, "property", "og:url", metadata.canonicalUrl);
  document = replaceMetaContent(document, "property", "og:image", metadata.image);
  document = replaceMetaContent(document, "property", "og:image:secure_url", metadata.image);
  document = replaceMetaContent(document, "property", "og:image:width", "1200");
  document = replaceMetaContent(document, "property", "og:image:height", "630");
  document = replaceMetaContent(document, "property", "og:image:alt", `לוגו ${APP_NAME}`);
  document = replaceMetaContent(document, "name", "twitter:title", metadata.title);
  document = replaceMetaContent(document, "name", "twitter:description", metadata.description);
  document = replaceMetaContent(document, "name", "twitter:image", metadata.image);
  return document;
}

function replaceTitle(document, value) {
  return document.replace(
    /<title>[^<]*<\/title>/i,
    () => `<title>${escapeHtml(value)}</title>`
  );
}

function replaceMetaContent(document, attribute, key, value) {
  const pattern = new RegExp(
    `(<meta\\s+${attribute}="${escapeRegExp(key)}"\\s+content=")[^"]*("\\s*\\/?>)`,
    "i"
  );
  const escapedValue = escapeHtml(value);
  return document.replace(pattern, (_match, prefix, suffix) => `${prefix}${escapedValue}${suffix}`);
}

function previewText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toUrl(value) {
  try {
    return value instanceof URL ? value : new URL(value);
  } catch {
    return null;
  }
}
