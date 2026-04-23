export interface DocMeta {
  slug: string;
  title: string;
  summary: string;
  file: string;
  audience: "user" | "llm";
}

export const DOCS: DocMeta[] = [
  {
    slug: "user-guide",
    title: "User Guide",
    summary: "Simple step-by-step guide to install and use the ImageGen CLI and MCP server. Written for humans.",
    file: "imagegen-user-guide.md",
    audience: "user",
  },
  {
    slug: "llm-reference",
    title: "LLM Reference",
    summary: "Structured technical reference of the platform — architecture, API, auth, data model, error contracts. Written for LLMs to consume.",
    file: "imagegen-llm-reference.md",
    audience: "llm",
  },
];

export function findDoc(slug: string): DocMeta | undefined {
  return DOCS.find((d) => d.slug === slug);
}
