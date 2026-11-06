import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = process.env.SOGRIM_DIAGNOSTIC_APP_DIR;
if (!root) throw new Error('Explicit original app checkout required');
const { default: base } = await import(pathToFileURL(resolve(root, 'playwright.config.mjs')).href);
export default {
  ...base,
  testDir: resolve(root, 'e2e'),
  // One exposure of the original cohort; never turn a retry into acceptance.
  retries: 0,
  webServer: {
    ...base.webServer,
    command: `node "${fileURLToPath(new URL('server.mjs', import.meta.url))}"`,
    cwd: root,
    stderr: 'inherit',
    env: { ...base.webServer.env,
      SOGRIM_DIAGNOSTIC_APP_DIR: root,
      SOGRIM_DIAGNOSTIC_HTTP_LOG: process.env.SOGRIM_DIAGNOSTIC_HTTP_LOG,
      PW_QA_PORT: '4186'
    }
  }
};
