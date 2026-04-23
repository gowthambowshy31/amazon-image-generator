import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface CliConfig {
  apiUrl: string;
  apiKey?: string;
}

const DEFAULT_API_URL = "https://imagegen.bowshai.com";

function configDir(): string {
  if (process.env.IMAGEGEN_CONFIG_DIR) return process.env.IMAGEGEN_CONFIG_DIR;
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "imagegen");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "imagegen");
}

function configPath(): string {
  return path.join(configDir(), "config.json");
}

export async function loadConfig(): Promise<CliConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      apiUrl: process.env.IMAGEGEN_API_URL || parsed.apiUrl || DEFAULT_API_URL,
      apiKey: process.env.IMAGEGEN_API_KEY || parsed.apiKey,
    };
  } catch {
    return {
      apiUrl: process.env.IMAGEGEN_API_URL || DEFAULT_API_URL,
      apiKey: process.env.IMAGEGEN_API_KEY,
    };
  }
}

export async function saveConfig(partial: Partial<CliConfig>): Promise<CliConfig> {
  const existing = await loadConfig();
  const next: CliConfig = {
    apiUrl: partial.apiUrl ?? existing.apiUrl,
    apiKey: partial.apiKey ?? existing.apiKey,
  };
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

export async function clearConfig(): Promise<void> {
  try {
    await fs.unlink(configPath());
  } catch {
    /* no-op */
  }
}

export function getConfigPath(): string {
  return configPath();
}
