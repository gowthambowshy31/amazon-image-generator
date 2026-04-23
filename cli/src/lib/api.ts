import { promises as fs } from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function requireConfig() {
  const cfg = await loadConfig();
  if (!cfg.apiKey) {
    throw new Error(
      "Not logged in. Run `imagegen login <api-key>` first (create a key at " +
        cfg.apiUrl +
        "/settings/api-keys)."
    );
  }
  return cfg;
}

async function parseResponse(res: Response) {
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  if (!res.ok) {
    const msg = typeof body === "object" && body?.error ? body.error : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body;
}

export async function apiGet<T = any>(pathname: string): Promise<T> {
  const cfg = await requireConfig();
  const res = await fetch(`${cfg.apiUrl}${pathname}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  return parseResponse(res);
}

export async function apiPostJson<T = any>(pathname: string, body: any): Promise<T> {
  const cfg = await requireConfig();
  const res = await fetch(`${cfg.apiUrl}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export interface GenerateMultipartArgs {
  filePath: string;
  prompt?: string;
  templateId?: string;
  variants: number;
  batchId?: string;
  model?: string;
  variables?: Record<string, string>;
}

export interface GenerateResult {
  batchId: string;
  source: string;
  prompt: string;
  variants: number;
  succeeded: number;
  failed: number;
  results: Array<
    | { variantIndex: number; url: string; key: string; size: number; mime: string }
    | { variantIndex: number; error: string }
  >;
}

function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  return "image/jpeg";
}

export async function generateFromFile(args: GenerateMultipartArgs): Promise<GenerateResult> {
  const cfg = await requireConfig();
  const buffer = await fs.readFile(args.filePath);
  const form = new FormData();
  const mime = mimeFromExt(args.filePath);
  const blob = new Blob([buffer as unknown as BlobPart], { type: mime });
  form.append("image", blob, path.basename(args.filePath));
  if (args.prompt) form.append("prompt", args.prompt);
  if (args.templateId) form.append("templateId", args.templateId);
  form.append("variants", String(args.variants));
  if (args.batchId) form.append("batchId", args.batchId);
  if (args.model) form.append("model", args.model);
  if (args.variables) form.append("variables", JSON.stringify(args.variables));

  const res = await fetch(`${cfg.apiUrl}/api/cli/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
  });
  return parseResponse(res);
}

export async function downloadUrl(url: string, destPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
  return buf.length;
}
