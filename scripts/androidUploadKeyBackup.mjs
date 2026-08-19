import { copyFile, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export function androidUploadKeyBackupPaths({
  homeDir = homedir(),
  keystoreFilename = "sogrim-upload-key.jks",
  propertiesFilename = "keystore.properties"
} = {}) {
  const keystoreBackupDir = join(
    homeDir,
    ".sogrim-hashbon",
    "android-upload-key"
  );
  const propertiesBackupDir = join(
    homeDir,
    ".sogrim-hashbon-secrets",
    "android-upload-key"
  );
  const keystoreBackupPath = join(
    keystoreBackupDir,
    basename(keystoreFilename)
  );
  const propertiesBackupPath = join(
    propertiesBackupDir,
    basename(propertiesFilename)
  );
  const legacyPropertiesBackupPath = join(
    keystoreBackupDir,
    basename(propertiesFilename)
  );

  assertSeparatedBackups({
    keystoreBackupDir,
    keystoreBackupPath,
    propertiesBackupDir,
    propertiesBackupPath
  });

  return {
    keystoreBackupDir,
    keystoreBackupPath,
    propertiesBackupDir,
    propertiesBackupPath,
    legacyPropertiesBackupPath
  };
}

export async function backupAndroidUploadKey({
  keystorePath,
  propertiesPath,
  homeDir = homedir()
}) {
  const paths = androidUploadKeyBackupPaths({
    homeDir,
    keystoreFilename: basename(keystorePath),
    propertiesFilename: basename(propertiesPath)
  });

  await Promise.all([
    mkdir(paths.keystoreBackupDir, { recursive: true }),
    mkdir(paths.propertiesBackupDir, { recursive: true })
  ]);

  // Preserve recovery material before removing backups made by older versions.
  await copyFile(propertiesPath, paths.propertiesBackupPath);
  await rm(paths.legacyPropertiesBackupPath, { force: true });
  await copyFile(keystorePath, paths.keystoreBackupPath);

  return paths;
}

function assertSeparatedBackups({
  keystoreBackupDir,
  keystoreBackupPath,
  propertiesBackupDir,
  propertiesBackupPath
}) {
  if (
    isWithin(keystoreBackupDir, propertiesBackupPath) ||
    isWithin(propertiesBackupDir, keystoreBackupPath) ||
    dirname(resolve(keystoreBackupPath)) === dirname(resolve(propertiesBackupPath))
  ) {
    throw new Error(
      "Android upload-key properties must be backed up separately from the JKS."
    );
  }
}

function isWithin(parentPath, candidatePath) {
  const pathFromParent = relative(resolve(parentPath), resolve(candidatePath));
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
  );
}
