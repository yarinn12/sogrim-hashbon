import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  isUsableJavaHome,
  resolveAndroidJavaHome
} from "../scripts/androidJava.mjs";

test("Android Java discovery rejects an incomplete configured runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "sogrim-java-"));
  try {
    const broken = join(root, "broken");
    const valid = join(root, "Android", "Android Studio1", "jbr");
    await createJavaHome(broken, { includeConfig: false });
    await createJavaHome(valid);

    assert.equal(isUsableJavaHome(broken, { platform: "win32" }), false);
    assert.equal(
      resolveAndroidJavaHome(
        { JAVA_HOME: broken, ProgramFiles: root },
        { platform: "win32", programFiles: root }
      ),
      valid
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Android Java discovery falls back to an Adoptium JDK", async () => {
  const root = await mkdtemp(join(tmpdir(), "sogrim-java-"));
  try {
    const valid = join(root, "Eclipse Adoptium", "jdk-21");
    await createJavaHome(valid);
    assert.equal(
      resolveAndroidJavaHome(
        { ProgramFiles: root },
        { platform: "win32", programFiles: root }
      ),
      valid
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createJavaHome(root, { includeConfig = true } = {}) {
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(root, "lib"), { recursive: true });
  await writeFile(join(root, "bin", "java.exe"), "qa");
  if (includeConfig) await writeFile(join(root, "lib", "jvm.cfg"), "-server KNOWN");
}
