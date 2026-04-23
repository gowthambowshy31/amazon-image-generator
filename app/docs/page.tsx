import Link from "next/link";
import { DOCS } from "./docs-manifest";

export const metadata = {
  title: "ImageGen Docs",
  description: "Documentation for the ImageGen platform — CLI, MCP server, and API reference.",
};

export default function DocsIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Documentation</h1>
        <p className="text-muted-foreground mt-2">
          Everything you need to use ImageGen — the CLI, the MCP server, and the underlying API.
        </p>
      </div>

      <div className="grid gap-4">
        {DOCS.map((d) => (
          <Link
            key={d.slug}
            href={`/docs/${d.slug}`}
            className="block border rounded-lg p-5 hover:border-primary hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">{d.title}</h2>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {d.audience === "llm" ? "For LLMs" : "For humans"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{d.summary}</p>
          </Link>
        ))}
      </div>

      <div className="pt-6 border-t text-sm text-muted-foreground space-y-1">
        <p>
          <strong className="text-foreground">Install the CLI:</strong>{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">npm i -g @bowshai/imagegen</code>
        </p>
        <p>
          <strong className="text-foreground">Install the MCP server:</strong>{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">npm i -g @bowshai/imagegen-mcp</code>
        </p>
        <p>
          <strong className="text-foreground">Get an API key:</strong>{" "}
          <Link href="/settings/api-keys" className="underline hover:text-foreground">
            /settings/api-keys
          </Link>
        </p>
      </div>
    </div>
  );
}
