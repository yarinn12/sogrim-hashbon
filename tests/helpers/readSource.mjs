import { readFile } from "node:fs/promises";

// Source assertions must behave identically for Git LF blobs and CRLF checkouts.
export async function readSource(file, options) {
  const value = await readFile(file, options);
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value;
}
