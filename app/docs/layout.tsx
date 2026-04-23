import Link from "next/link";
import { DOCS } from "./docs-manifest";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/docs" className="font-semibold text-lg">
            ImageGen Docs
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="https://imagegen.bowshai.com" className="text-muted-foreground hover:text-foreground">
              imagegen.bowshai.com
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Log in
            </Link>
          </nav>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
        <aside className="hidden md:block">
          <div className="sticky top-6 space-y-1 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Docs</div>
            {DOCS.map((d) => (
              <Link
                key={d.slug}
                href={`/docs/${d.slug}`}
                className="block px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {d.title}
              </Link>
            ))}
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
