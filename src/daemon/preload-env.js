/**
 * Side-effect module: load env files into process.env at import time.
 *
 * Imported first from daemon/index.js so that any downstream static import
 * (config.js getters, db/cortex.js → selectDriver) sees SIGIL_DATABASE_URL
 * and friends. Mirrors the precedence used by cli.js:
 *   shell env > project ./.env > global ~/.sigil/.env
 * dotenv never overwrites existing keys, so loading project first gives it
 * priority over global, and shell-set values always win.
 */
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { config as dotenvConfig } from 'dotenv';

const projectEnv = resolve(process.cwd(), '.env');
const globalEnv = join(homedir(), '.sigil', '.env');

if (existsSync(projectEnv)) {
  dotenvConfig({ path: projectEnv, quiet: true });
}
if (existsSync(globalEnv) && globalEnv !== projectEnv) {
  dotenvConfig({ path: globalEnv, quiet: true });
}
