import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { demoState } from "../data/demoData.mjs";

export function createStateStore(filePath) {
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
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
