import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DOCS, findDoc } from "../docs-manifest";

export const dynamic = "force-static";

export async function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = findDoc(slug);
  if (!doc) return { title: "Not found" };
  return { title: `${doc.title} — ImageGen Docs`, description: doc.summary };
}

async function loadDoc(slug: string): Promise<{ content: string; meta: (typeof DOCS)[number] } | null> {
  const meta = findDoc(slug);
  if (!meta) return null;
  const filePath = path.join(process.cwd(), "docs", meta.file);
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { content, meta };
  } catch {
    return null;
  }
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loaded = await loadDoc(slug);
  if (!loaded) notFound();
  const { content, meta } = loaded;

  return (
    <article>
      <div className="mb-6">
        <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">
          ← All docs
        </Link>
      </div>
      <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-pre:bg-muted prose-pre:border prose-code:text-primary prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.9em] prose-a:text-primary hover:prose-a:underline">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      <div className="mt-12 pt-6 border-t text-sm text-muted-foreground">
        <p>
          Source: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">docs/{meta.file}</code>
        </p>
        <p className="mt-1">
          Raw markdown:{" "}
          <Link
            href={`/api/docs/${meta.slug}`}
            className="underline hover:text-foreground"
          >
            /api/docs/{meta.slug}
          </Link>{" "}
          — useful if you want to hand the text directly to an LLM.
        </p>
      </div>
    </article>
  );
}
