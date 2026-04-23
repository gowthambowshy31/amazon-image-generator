import kleur from "kleur";
import { saveConfig, loadConfig, getConfigPath } from "../lib/config.js";

export async function loginCommand(apiKey: string, opts: { apiUrl?: string }) {
  if (!apiKey.startsWith("igp_")) {
    console.error(kleur.red("API keys must start with 'igp_'."));
    process.exit(1);
  }
  const next = await saveConfig({
    apiKey,
    ...(opts.apiUrl ? { apiUrl: opts.apiUrl } : {}),
  });

  const res = await fetch(`${next.apiUrl}/api/cli/whoami`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    console.error(kleur.red(`Key rejected (HTTP ${res.status}). Try again.`));
    process.exit(1);
  }
  const me = await res.json();
  console.log(kleur.green("✓ Logged in as"), me.email);
  console.log(kleur.gray(`  API: ${next.apiUrl}`));
  console.log(kleur.gray(`  Config: ${getConfigPath()}`));
}

export async function logoutCommand() {
  await saveConfig({ apiKey: undefined });
  console.log(kleur.green("✓ Logged out."));
}

export async function whoamiCommand() {
  const cfg = await loadConfig();
  if (!cfg.apiKey) {
    console.log(kleur.yellow("Not logged in."));
    process.exit(1);
  }
  const res = await fetch(`${cfg.apiUrl}/api/cli/whoami`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) {
    console.error(kleur.red(`Whoami failed (HTTP ${res.status}).`));
    process.exit(1);
  }
  const me = await res.json();
  console.log(kleur.bold("Logged in as:"), me.email);
  console.log(kleur.gray(`  Role: ${me.role}`));
  console.log(kleur.gray(`  API:  ${cfg.apiUrl}`));
}
