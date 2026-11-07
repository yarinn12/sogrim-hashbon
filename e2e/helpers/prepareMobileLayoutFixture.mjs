import { resetLocalQaStateFresh } from "./resetLocalQaStateFresh.mjs";
import { writeLocalQaStateFresh } from "./writeLocalQaStateFresh.mjs";

export async function prepareMobileLayoutFixture({ baseURL, state }) {
  await resetLocalQaStateFresh(baseURL);
  await writeLocalQaStateFresh(baseURL, state);
}
