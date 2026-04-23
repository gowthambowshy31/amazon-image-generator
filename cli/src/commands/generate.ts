import path from "node:path";
import kleur from "kleur";
import { collectImages, ensureDir } from "../lib/fs-utils.js";
import { generateFromFile, downloadUrl } from "../lib/api.js";

export interface GenerateOptions {
  prompt?: string;
  template?: string;
  variants: string;
  out?: string;
  concurrency: string;
  batch?: string;
  model?: string;
  noDownload?: boolean;
  vars?: string[];
}

function parseVars(list: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!list) return out;
  for (const item of list) {
    const idx = item.indexOf("=");
    if (idx === -1) continue;
    out[item.slice(0, idx)] = item.slice(idx + 1);
  }
  return out;
}

async function runLimited<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

export async function generateCommand(input: string, opts: GenerateOptions) {
  if (!opts.prompt && !opts.template) {
    console.error(kleur.red("Either --prompt or --template is required."));
    process.exit(1);
  }

  const variants = Math.max(1, Math.min(10, parseInt(opts.variants, 10) || 1));
  const concurrency = Math.max(1, Math.min(8, parseInt(opts.concurrency, 10) || 2));
  const outDir = path.resolve(opts.out || "./imagegen-output");
  const batchId =
    opts.batch || `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const variables = parseVars(opts.vars);

  console.log(kleur.bold("ImageGen bulk generation"));
  console.log(kleur.gray(`  Input:       ${path.resolve(input)}`));
  console.log(kleur.gray(`  Variants:    ${variants} per image`));
  console.log(kleur.gray(`  Concurrency: ${concurrency}`));
  console.log(kleur.gray(`  Batch:       ${batchId}`));
  if (opts.model) console.log(kleur.gray(`  Model:       ${opts.model}`));
  if (opts.template) console.log(kleur.gray(`  Template:    ${opts.template}`));
  if (!opts.noDownload) console.log(kleur.gray(`  Out dir:     ${outDir}`));
  console.log();

  const files = await collectImages(input);
  if (files.length === 0) {
    console.error(kleur.red("No image files found."));
    process.exit(1);
  }
  console.log(kleur.cyan(`Found ${files.length} image(s). Generating ${files.length * variants} total variants.`));
  console.log();

  if (!opts.noDownload) await ensureDir(outDir);

  const started = Date.now();
  let successCount = 0;
  let failCount = 0;

  await runLimited(files, concurrency, async (file, index) => {
    const name = path.basename(file);
    try {
      const res = await generateFromFile({
        filePath: file,
        prompt: opts.prompt,
        templateId: opts.template,
        variants,
        batchId,
        model: opts.model,
        variables,
      });

      for (const r of res.results) {
        if ("error" in r) {
          failCount++;
          console.log(
            kleur.red(`✗ ${name} v${r.variantIndex}: ${r.error}`)
          );
          continue;
        }
        successCount++;
        if (opts.noDownload) {
          console.log(kleur.green(`✓ ${name} v${r.variantIndex}`), kleur.gray(r.url));
        } else {
          const ext = r.mime.includes("jpeg") ? "jpg" : r.mime.includes("webp") ? "webp" : "png";
          const stem = name.replace(/\.[^.]+$/, "");
          const dest = path.join(outDir, `${stem}_v${r.variantIndex}.${ext}`);
          await downloadUrl(r.url, dest);
          console.log(
            kleur.green(`✓ [${index + 1}/${files.length}] ${name} v${r.variantIndex}`),
            kleur.gray(`→ ${path.relative(process.cwd(), dest)}`)
          );
        }
      }
    } catch (err) {
      failCount += variants;
      console.log(kleur.red(`✗ ${name}: ${(err as Error).message}`));
    }
  });

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log();
  console.log(
    kleur.bold(
      `Done in ${secs}s — ${kleur.green(`${successCount} ok`)}, ${
        failCount ? kleur.red(`${failCount} failed`) : "0 failed"
      }`
    )
  );
  if (!opts.noDownload) console.log(kleur.gray(`Output: ${outDir}`));
  console.log(kleur.gray(`Batch ID: ${batchId}`));

  if (failCount > 0) process.exit(1);
}
