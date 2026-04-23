import path from "node:path";
import kleur from "kleur";
import { apiPostJson, downloadUrl } from "../lib/api.js";
import { ensureDir } from "../lib/fs-utils.js";

export interface VideoOptions {
  aspect: string;
  duration: string;
  resolution: string;
  out?: string;
  pollInterval: string;
  timeout: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function videoCommand(prompt: string, opts: VideoOptions) {
  if (!prompt || !prompt.trim()) {
    console.error(kleur.red("prompt argument is required"));
    process.exit(1);
  }

  const pollMs = Math.max(2000, parseInt(opts.pollInterval, 10) * 1000 || 10000);
  const timeoutMs = Math.max(30000, parseInt(opts.timeout, 10) * 1000 || 600000);
  const outDir = path.resolve(opts.out || "./imagegen-output");

  console.log(kleur.bold("ImageGen video generation"));
  console.log(kleur.gray(`  Prompt:      ${prompt.slice(0, 120)}${prompt.length > 120 ? "..." : ""}`));
  console.log(kleur.gray(`  Aspect:      ${opts.aspect}`));
  console.log(kleur.gray(`  Duration:    ${opts.duration}s`));
  console.log(kleur.gray(`  Resolution:  ${opts.resolution}`));
  console.log();

  const start = await apiPostJson<{ operationName: string }>("/api/cli/video", {
    prompt,
    aspectRatio: opts.aspect,
    durationSeconds: parseInt(opts.duration, 10),
    resolution: opts.resolution,
  });
  const operationName = start.operationName;
  console.log(kleur.cyan("Started:"), kleur.gray(operationName));

  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    await sleep(pollMs);
    const st = await apiPostJson<{ done: boolean; url?: string; error?: string }>(
      "/api/cli/video/status",
      { operationName }
    );
    if (!st.done) {
      process.stdout.write(kleur.gray(`  polling... (${attempts}×${pollMs / 1000}s)\r`));
      continue;
    }
    if (st.error || !st.url) {
      console.log();
      console.error(kleur.red("Video generation failed:"), st.error || "no url");
      process.exit(1);
    }
    console.log();
    await ensureDir(outDir);
    const dest = path.join(outDir, `video-${Date.now()}.mp4`);
    const bytes = await downloadUrl(st.url, dest);
    console.log(kleur.green("✓ Saved"), kleur.gray(dest), kleur.gray(`(${(bytes / 1024 / 1024).toFixed(2)} MB)`));
    return;
  }

  console.error(kleur.red(`Timed out after ${timeoutMs / 1000}s. Operation still running: ${operationName}`));
  process.exit(1);
}
