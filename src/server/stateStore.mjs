import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { dirname, basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { demoState } from "../data/demoData.mjs";
import { assertValidSharedStatePayload } from "./stateValidation.mjs";

const pendingWrites = new Map();

export function createStateStore(filePath) {
  filePath = resolve(filePath);
  return {
    async load() {
      try {
        const raw = await readFile(filePath, "utf8");
        return JSON.parse(raw);
      } catch (error) {
        if (error?.code === "ENOENT") {
          return clone(demoState);
        }
        throw error;
      }
    },

    async save(state) {
      assertValidSharedStatePayload(state);
      // Capture the acknowledged snapshot before it waits behind another save.
      const serialized = JSON.stringify(state, null, 2);
      const previous = pendingWrites.get(filePath) ?? Promise.resolve();
      const write = previous.catch(() => {}).then(async () => {
        const directory = dirname(filePath);
        const temporary = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);
        await mkdir(directory, { recursive: true });
        try {
          await writeFile(temporary, serialized, { encoding: "utf8", flag: "wx" });
          // Readers see the previous complete snapshot until the replacement succeeds.
          await rename(temporary, filePath);
        } finally {
          await rm(temporary, { force: true });
        }
      });
      pendingWrites.set(filePath, write);
      try {
        await write;
      } finally {
        if (pendingWrites.get(filePath) === write) pendingWrites.delete(filePath);
      }
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
