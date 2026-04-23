import { promises as fs } from "node:fs";
import path from "node:path";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"]);

export async function collectImages(inputPath: string): Promise<string[]> {
  const stat = await fs.stat(inputPath).catch(() => null);
  if (!stat) throw new Error(`Path not found: ${inputPath}`);

  if (stat.isFile()) {
    if (!IMAGE_EXTS.has(path.extname(inputPath).toLowerCase())) {
      throw new Error(`Not an image file: ${inputPath}`);
    }
    return [path.resolve(inputPath)];
  }

  const entries = await fs.readdir(inputPath, { withFileTypes: true });
  const images: string[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (IMAGE_EXTS.has(ext)) {
      images.push(path.resolve(path.join(inputPath, e.name)));
    }
  }
  images.sort();
  return images;
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}
