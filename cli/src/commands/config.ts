import kleur from "kleur";
import { loadConfig, saveConfig, getConfigPath } from "../lib/config.js";

export async function configShowCommand() {
  const cfg = await loadConfig();
  console.log(kleur.bold("ImageGen CLI config"));
  console.log(kleur.gray(`  File:   ${getConfigPath()}`));
  console.log(kleur.gray(`  API:    ${cfg.apiUrl}`));
  console.log(
    kleur.gray(
      `  Key:    ${cfg.apiKey ? `${cfg.apiKey.slice(0, 12)}… (${cfg.apiKey.length} chars)` : "(not set)"}`
    )
  );
}

export async function configSetApiUrlCommand(url: string) {
  const next = await saveConfig({ apiUrl: url });
  console.log(kleur.green("✓ API URL updated:"), next.apiUrl);
}
