// Account fixtures must finish their first inbox read before another forced
// document replacement. Rows render earlier than this background bootstrap.
export async function navigateWithPersonalPinsInbox(page, navigate, { origin, userId }) {
  const inbox = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === "/rest/v1/notification_inbox" &&
      url.searchParams.get("recipient_user_id") === `eq.${userId}` &&
      response.request().method() === "GET";
  });
  const [result, response] = await Promise.all([Promise.resolve().then(navigate), inbox]);
  if (!response.ok()) throw new Error(`Synthetic account inbox returned ${response.status()}`);
  const failure = await response.finished();
  if (failure) throw failure;
  return result;
}
