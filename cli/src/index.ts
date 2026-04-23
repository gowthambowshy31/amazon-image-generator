#!/usr/bin/env node
import { Command } from "commander";
import kleur from "kleur";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/login.js";
import { generateCommand } from "./commands/generate.js";
import { videoCommand } from "./commands/video.js";
import { templatesCommand } from "./commands/templates.js";
import { configShowCommand, configSetApiUrlCommand } from "./commands/config.js";
import { ApiError } from "./lib/api.js";

const program = new Command();

program
  .name("imagegen")
  .description("Bulk AI image & video variation generator — point it at a folder, get variants.")
  .version("0.1.0");

program
  .command("login <apiKey>")
  .description("Save an API key for future commands.")
  .option("--api-url <url>", "Override the API base URL")
  .action((apiKey, opts) => loginCommand(apiKey, opts));

program
  .command("logout")
  .description("Remove the saved API key.")
  .action(() => logoutCommand());

program
  .command("whoami")
  .description("Show the logged-in account.")
  .action(() => whoamiCommand());

program
  .command("generate <input>")
  .description("Generate N variations for each image in a folder (or a single file).")
  .option("-p, --prompt <text>", "Prompt describing the desired variation")
  .option("-t, --template <id>", "Template ID (overrides --prompt; see `imagegen templates`)")
  .option(
    "--var <key=value...>",
    "Template variable (repeatable, e.g. --var material=gold --var bg=studio)",
    (val, prev: string[] = []) => prev.concat(val),
    []
  )
  .option("-n, --variants <count>", "Variants per image (1–10)", "3")
  .option("-o, --out <dir>", "Output directory", "./imagegen-output")
  .option("-c, --concurrency <n>", "Parallel requests (1–8)", "2")
  .option("--batch <id>", "Custom batch ID (defaults to cli-<timestamp>)")
  .option("--model <name>", "Override the image model")
  .option("--no-download", "Don't download results; just print URLs")
  .action((input, opts) =>
    generateCommand(input, {
      prompt: opts.prompt,
      template: opts.template,
      vars: opts.var,
      variants: opts.variants,
      out: opts.out,
      concurrency: opts.concurrency,
      batch: opts.batch,
      model: opts.model,
      noDownload: opts.download === false,
    })
  );

program
  .command("video <prompt>")
  .description("Generate a single video from a text prompt (Veo 3.1).")
  .option("--aspect <ratio>", "Aspect ratio", "16:9")
  .option("--duration <seconds>", "Duration in seconds", "4")
  .option("--resolution <res>", "Resolution (720p, 1080p)", "720p")
  .option("-o, --out <dir>", "Output directory", "./imagegen-output")
  .option("--poll-interval <seconds>", "How often to poll status", "10")
  .option("--timeout <seconds>", "Max wait for completion", "600")
  .action((prompt, opts) => videoCommand(prompt, opts));

program
  .command("templates")
  .description("List available prompt templates.")
  .option("--category <cat>", "Filter: image, video, both")
  .option("--json", "Emit raw JSON")
  .action((opts) => templatesCommand(opts));

const configCmd = program.command("config").description("Manage CLI config.");
configCmd
  .command("show")
  .description("Print current config.")
  .action(() => configShowCommand());
configCmd
  .command("set-api-url <url>")
  .description("Override the API base URL (e.g. for local development).")
  .action((url) => configSetApiUrlCommand(url));

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof ApiError) {
    console.error(kleur.red(`API error (${err.status}):`), err.message);
  } else if (err instanceof Error) {
    console.error(kleur.red("Error:"), err.message);
  } else {
    console.error(kleur.red("Error:"), err);
  }
  process.exit(1);
});
