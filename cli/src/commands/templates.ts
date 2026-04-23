import kleur from "kleur";
import { apiGet } from "../lib/api.js";

interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: string;
  variables: Array<{ name: string; displayName: string; type: string; isRequired: boolean }>;
}

export async function templatesCommand(opts: { category?: string; json?: boolean }) {
  const query = opts.category ? `?category=${encodeURIComponent(opts.category)}` : "";
  const res = await apiGet<{ templates: TemplateSummary[] }>(`/api/cli/templates${query}`);
  const templates = res.templates || [];

  if (opts.json) {
    console.log(JSON.stringify(templates, null, 2));
    return;
  }

  if (templates.length === 0) {
    console.log(kleur.yellow("No templates available."));
    return;
  }

  console.log(kleur.bold(`${templates.length} template(s):`));
  console.log();
  for (const t of templates) {
    console.log(kleur.cyan(t.name), kleur.gray(`(${t.category})`));
    console.log(kleur.gray(`  id: ${t.id}`));
    if (t.description) console.log(kleur.gray(`  ${t.description}`));
    if (t.variables.length > 0) {
      console.log(
        kleur.gray(
          `  vars: ${t.variables
            .map((v) => `${v.name}${v.isRequired ? "*" : ""}`)
            .join(", ")}`
        )
      );
    }
    console.log();
  }
  console.log(
    kleur.gray(
      "Use a template: imagegen generate ./images --template <id> --var name=value --variants 3"
    )
  );
}
