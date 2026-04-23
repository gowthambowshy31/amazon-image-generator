#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "node:fs";
import path from "node:path";

const API_URL = process.env.IMAGEGEN_API_URL || "https://imagegen.bowshai.com";
const API_KEY = process.env.IMAGEGEN_API_KEY;

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"]);

function requireKey() {
  if (!API_KEY) {
    throw new Error(
      "IMAGEGEN_API_KEY not set. Create a key at " +
        API_URL +
        "/settings/api-keys and put it in the MCP client's env config."
    );
  }
  return API_KEY;
}

async function apiPostJson<T = any>(pathname: string, body: any): Promise<T> {
  const key = requireKey();
  const res = await fetch(`${API_URL}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* leave */
  }
  if (!res.ok) {
    const msg = parsed?.error || `HTTP ${res.status}`;
    throw new Error(`API ${pathname}: ${msg}`);
  }
  return parsed;
}

async function apiGet<T = any>(pathname: string): Promise<T> {
  const key = requireKey();
  const res = await fetch(`${API_URL}${pathname}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* leave */
  }
  if (!res.ok) {
    const msg = parsed?.error || `HTTP ${res.status}`;
    throw new Error(`API ${pathname}: ${msg}`);
  }
  return parsed;
}

async function generateFromFile(args: {
  filePath: string;
  prompt?: string;
  templateId?: string;
  variants: number;
  batchId?: string;
  variables?: Record<string, string>;
}) {
  const key = requireKey();
  const buffer = await fs.readFile(args.filePath);
  const form = new FormData();
  form.append("image", new Blob([buffer as unknown as BlobPart]), path.basename(args.filePath));
  if (args.prompt) form.append("prompt", args.prompt);
  if (args.templateId) form.append("templateId", args.templateId);
  form.append("variants", String(args.variants));
  if (args.batchId) form.append("batchId", args.batchId);
  if (args.variables) form.append("variables", JSON.stringify(args.variables));

  const res = await fetch(`${API_URL}/api/cli/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* leave */
  }
  if (!res.ok) {
    throw new Error(`generate failed: ${parsed?.error || res.status}`);
  }
  return parsed;
}

async function collectImages(inputPath: string): Promise<string[]> {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) {
    return IMAGE_EXTS.has(path.extname(inputPath).toLowerCase())
      ? [path.resolve(inputPath)]
      : [];
  }
  const entries = await fs.readdir(inputPath, { withFileTypes: true });
  const images: string[] = [];
  for (const e of entries) {
    if (e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) {
      images.push(path.resolve(path.join(inputPath, e.name)));
    }
  }
  return images.sort();
}

async function downloadToFile(url: string, destPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
  return buf.length;
}

const server = new Server(
  { name: "imagegen", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_variations",
      description:
        "Generate N AI variations of every image in a local folder (or a single image file). " +
        "Uploads each source to the ImageGen API, generates variants with Gemini, and downloads them to an output folder. " +
        "Use this when the user has a folder of product photos and wants multiple AI-enhanced versions of each.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: {
            type: "string",
            description: "Absolute path to a local image file or folder containing images.",
          },
          prompt: {
            type: "string",
            description:
              "Freeform prompt describing the desired variation (e.g. 'studio lighting, white background, professional product shot'). Either this or templateId is required.",
          },
          templateId: {
            type: "string",
            description:
              "ID of a saved prompt template (see list_templates). Overrides prompt if both given.",
          },
          variables: {
            type: "object",
            description:
              "Variable values for the template (e.g. { material: 'gold', background: 'studio' }).",
            additionalProperties: { type: "string" },
          },
          variants: {
            type: "integer",
            description: "Number of variants per input image (1–10).",
            minimum: 1,
            maximum: 10,
            default: 3,
          },
          outputPath: {
            type: "string",
            description:
              "Absolute path to the folder where generated images should be saved. Defaults to <inputPath>/imagegen-output.",
          },
          batchId: {
            type: "string",
            description: "Optional custom batch ID (otherwise auto-generated).",
          },
        },
        required: ["inputPath"],
      },
    },
    {
      name: "generate_video",
      description:
        "Generate a single AI video from a text prompt using Veo 3.1. Returns the S3 URL of the rendered video and optionally saves a local copy.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Text prompt describing the video." },
          aspectRatio: { type: "string", default: "16:9", description: "e.g. 16:9, 9:16" },
          durationSeconds: { type: "integer", default: 4, minimum: 2, maximum: 8 },
          resolution: { type: "string", default: "720p", description: "720p or 1080p" },
          outputPath: {
            type: "string",
            description:
              "Optional absolute folder path to save the mp4 into. If omitted, only the URL is returned.",
          },
          pollIntervalSeconds: { type: "integer", default: 10, minimum: 2 },
          timeoutSeconds: { type: "integer", default: 600, minimum: 30 },
        },
        required: ["prompt"],
      },
    },
    {
      name: "list_templates",
      description:
        "List the prompt templates available on the user's ImageGen account. Use this before generate_variations if the user mentions a specific style or template.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filter: image, video, or both (default).",
          },
        },
      },
    },
    {
      name: "whoami",
      description:
        "Verify the API key is valid and show which account the server is connected to.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, any>;

  try {
    if (name === "whoami") {
      const me = await apiGet("/api/cli/whoami");
      return {
        content: [{ type: "text", text: `Connected as ${me.email} (role: ${me.role}). API: ${API_URL}` }],
      };
    }

    if (name === "list_templates") {
      const q = args.category ? `?category=${encodeURIComponent(args.category)}` : "";
      const res = await apiGet<{ templates: any[] }>(`/api/cli/templates${q}`);
      const templates = res.templates || [];
      if (templates.length === 0) {
        return { content: [{ type: "text", text: "No templates available." }] };
      }
      const lines = templates.map(
        (t) =>
          `• ${t.name} [${t.category}] id=${t.id}` +
          (t.description ? `\n    ${t.description}` : "") +
          (t.variables?.length
            ? `\n    vars: ${t.variables
                .map((v: any) => `${v.name}${v.isRequired ? "*" : ""}`)
                .join(", ")}`
            : "")
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (name === "generate_variations") {
      const inputPath: string = args.inputPath;
      if (!inputPath) throw new Error("inputPath required");
      const variants = Math.max(1, Math.min(10, Number(args.variants ?? 3)));
      const prompt: string | undefined = args.prompt;
      const templateId: string | undefined = args.templateId;
      if (!prompt && !templateId) throw new Error("prompt or templateId required");

      const files = await collectImages(inputPath);
      if (files.length === 0) throw new Error(`No images found at ${inputPath}`);

      const outDir =
        args.outputPath ||
        path.join(
          (await fs.stat(inputPath)).isDirectory() ? inputPath : path.dirname(inputPath),
          "imagegen-output"
        );
      await fs.mkdir(outDir, { recursive: true });

      const batchId: string =
        args.batchId || `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const summary: string[] = [];
      let ok = 0;
      let fail = 0;
      const allUrls: string[] = [];

      for (const file of files) {
        const name = path.basename(file);
        try {
          const res = await generateFromFile({
            filePath: file,
            prompt,
            templateId,
            variants,
            batchId,
            variables: args.variables,
          });
          for (const r of res.results || []) {
            if (r.error) {
              fail++;
              summary.push(`✗ ${name} v${r.variantIndex}: ${r.error}`);
              continue;
            }
            ok++;
            const ext = r.mime?.includes("jpeg") ? "jpg" : r.mime?.includes("webp") ? "webp" : "png";
            const stem = name.replace(/\.[^.]+$/, "");
            const dest = path.join(outDir, `${stem}_v${r.variantIndex}.${ext}`);
            await downloadToFile(r.url, dest);
            summary.push(`✓ ${name} v${r.variantIndex} → ${dest}`);
            allUrls.push(r.url);
          }
        } catch (err) {
          fail += variants;
          summary.push(`✗ ${name}: ${(err as Error).message}`);
        }
      }

      const header =
        `Generated ${ok} variant(s), ${fail} failed across ${files.length} image(s).\n` +
        `Batch: ${batchId}\nOutput: ${outDir}\n`;
      return { content: [{ type: "text", text: header + "\n" + summary.join("\n") }] };
    }

    if (name === "generate_video") {
      const prompt: string = args.prompt;
      if (!prompt) throw new Error("prompt required");
      const start = await apiPostJson<{ operationName: string }>("/api/cli/video", {
        prompt,
        aspectRatio: args.aspectRatio || "16:9",
        durationSeconds: Number(args.durationSeconds ?? 4),
        resolution: args.resolution || "720p",
      });
      const pollMs = Math.max(2000, Number(args.pollIntervalSeconds ?? 10) * 1000);
      const deadline = Date.now() + Math.max(30000, Number(args.timeoutSeconds ?? 600) * 1000);

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollMs));
        const st = await apiPostJson<{ done: boolean; url?: string; error?: string }>(
          "/api/cli/video/status",
          { operationName: start.operationName }
        );
        if (!st.done) continue;
        if (st.error || !st.url) throw new Error(st.error || "no url in response");

        let savedText = "";
        if (args.outputPath) {
          const dest = path.join(args.outputPath, `video-${Date.now()}.mp4`);
          const bytes = await downloadToFile(st.url, dest);
          savedText = `\nSaved to: ${dest} (${(bytes / 1024 / 1024).toFixed(2)} MB)`;
        }
        return {
          content: [
            { type: "text", text: `Video ready.\nURL: ${st.url}${savedText}` },
          ],
        };
      }
      throw new Error(`Video generation timed out. Operation: ${start.operationName}`);
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("MCP server fatal:", err);
  process.exit(1);
});
