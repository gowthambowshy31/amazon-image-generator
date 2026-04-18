/**
 * Shared Environment Loader
 *
 * Loads the master .env.shared file from the Project-kit folder BEFORE
 * the project's own .env is processed. Project .env overrides shared values.
 *
 * Usage: Import this file at the top of next.config.ts:
 *   import "./lib/load-env";
 */

import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

const SHARED_ENV_PATH =
  process.env.SHARED_ENV_PATH ||
  resolve("C:/work/Project-kit/.env.shared");

if (existsSync(SHARED_ENV_PATH)) {
  config({ path: SHARED_ENV_PATH });
} else {
  console.warn(
    `[load-env] Shared env file not found: ${SHARED_ENV_PATH}\n` +
      `  Shared credentials will not be available.\n` +
      `  Set SHARED_ENV_PATH in .env to customize the path.`
  );
}
