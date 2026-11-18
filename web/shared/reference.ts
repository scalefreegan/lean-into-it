// docs/CONTENT-REFERENCE.md, as text: every widget and exercise kind with
// its parameters and examples, and every move, straight from the registry
// and the move table. `npm run gen:reference` writes the file; a test fails
// when the file and this disagree, so the reference cannot go stale.

import { lineShape, MOVES } from "./moves.ts";
import { exerciseBlock, EXERCISES, WIDGETS, widgetBlock, type ExerciseKind, type ParamSpec, type ParamSpecs, type ParamType, type WidgetType } from "./registry.ts";

const KINDS: Record<string, string> = {
  string: "one line of text",
  text: "text; when it runs over several lines, write `|` after the colon and indent the lines under it",
  number: "a number",
  boolean: "`true` or `false`",
  "string[]": "a list of text: `[a, b]`",
  "number[]": "a list of numbers: `[1, 2]`",
  "move[]": "a list of move ids (see Moves below): `[intro, exact]`",
  state: "a proof state as Lean prints it, indented under `state: |`: facts, then a line starting `⊢`",
  "expr[]": 'a list of expressions in x: `["2x + 1", "x^2"]`',
  range: "two numbers, the smaller first: `[-5, 5]`",
  "point[]": 'a list of numbers on a line, each optionally labelled: `[0, "1/2", "sqrt(2): √2"]`',
  "interval[]": 'a list of intervals: `["(2, 4)", "[0, inf)"]`',
};

/** A parameter type in words an author can act on. */
export function kindOf(type: ParamType): string {
  if (type.startsWith("enum[]:")) return `a list drawn from ${type.slice(7).split("|").map((v) => `\`${v}\``).join(", ")}`;
  if (type.startsWith("enum:")) return `one of ${type.slice(5).split("|").map((v) => `\`${v}\``).join(", ")}`;
  return KINDS[type] ?? type;
}

const cell = (text: string) => text.replaceAll("|", "\\|").replace(/\s*\n\s*/g, " ");

function bounds(s: ParamSpec): string {
  const range = s.min !== undefined && s.max !== undefined ? `${s.min} to ${s.max}` : s.min !== undefined ? `at least ${s.min}` : s.max !== undefined ? `at most ${s.max}` : "";
  const parts = [s.integer ? "a whole number" : "", range].filter(Boolean);
  return parts.length ? ` Must be ${parts.join(", ")}.` : "";
}

function table(params: ParamSpecs): string {
  const rows = Object.entries(params);
  if (!rows.length) return "No parameters.\n";
  return ["| Parameter | Value | |", "|---|---|---|", ...rows.map(([name, s]) => `| \`${name}\`${s.required ? " (required)" : ""} | ${cell(kindOf(s.type))} | ${cell(s.doc + bounds(s))} |`)].join("\n") + "\n";
}

/** A move's line as code, with any remark about it in words after the code. */
export function shown(shape: string): string {
  const m = /^(.*?)( \(.*\))?$/.exec(shape)!;
  return `\`${m[1]}\`${m[2] ?? ""}`;
}

/** The whole reference file. */
export function reference(): string {
  const out: string[] = [
    "# Lean Into It: widget, exercise and move reference",
    "",
    "Generated from `web/shared/registry.ts` and `web/shared/moves.ts` by `npm run gen:reference`. Do not edit by hand: `npm test` fails when this file and the registry disagree.",
    "The file format these plug into is described in [CONTENT.md](CONTENT.md). The Gallery page of the running app (`#/gallery`) draws every widget example below.",
    "",
    "A parameter the entry does not list, a missing required one, or a value of the wrong kind is refused when the lesson loads, and the Path page says which and why.",
    "",
    "## Widgets",
    "",
    "A widget is a fenced block in a lesson's body: ` ```widget `, then `type:` and the parameters as YAML.",
    "",
  ];
  for (const [name, w] of Object.entries(WIDGETS)) {
    out.push(`### \`${name}\``, "", w.doc, "", table(w.params));
    for (const example of w.examples) out.push("````", widgetBlock(name as WidgetType, example), "````", "");
  }
  out.push(
    "## Exercise kinds",
    "",
    "An exercise is an entry under `exercises:` in a lesson's frontmatter. Every exercise takes `id` (required; lowercase letters, digits and hyphens; unique in its lesson; never changed once live), `kind` (default `prove`), `title` (required) and `concept` (default: the lesson's first concept; required when the lesson lists none), and then the parameters of its kind.",
    "",
  );
  for (const [name, e] of Object.entries(EXERCISES)) {
    out.push(`### \`${name}\` (shown as “${e.label}”)`, "", e.doc, "", table(e.params));
    e.examples.forEach((example, i) => out.push("```yaml", "exercises:", exerciseBlock(name as ExerciseKind, `${name}-example-${i + 1}`, "An example", example), "```", ""));
  }
  out.push(
    "## Moves",
    "",
    "The ids a board exercise's `moves` and a `move-list` widget may name. Each click on the proof board writes one line of Lean, and every line of a board exercise's `solution` must be a line one of its moves writes (`npm test` replays it against Lean's goals).",
    "",
    "| Move | It needs | The line it writes | What it does |",
    "|---|---|---|---|",
  );
  const needs = { none: "nothing", fact: "a fact, clicked", name: "nothing (it picks a name)", text: "something typed", object: "one of the statement's objects, clicked" };
  for (const m of Object.values(MOVES)) out.push(`| \`${m.id}\` | ${needs[m.needs]} | ${shown(lineShape(m))} | ${cell(m.does)} |`);
  return out.join("\n") + "\n";
}
