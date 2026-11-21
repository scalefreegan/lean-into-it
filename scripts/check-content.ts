// Check content/ the way the app does, and then against the real Lean.
//
//   npm run check:content                      structure, every reference solution, every Lean snippet
//   npm run check:content -- --no-lean         structure only (fast; what the app checks when it starts)
//   npm run check:content -- --lean            fail, do not skip, when Lean is not installed
//   npm run check:content -- --lesson <id>     the Lean pass for one lesson (may be repeated)
//   npm run check:content -- --gaps            also list what the curriculum promises and does not yet have
//
// Exits 1 when anything is wrong, so it can gate a pull request. Where Lean
// is not installed the Lean pass is skipped with a loud line and the exit
// code says only what the structure check found, unless --lean was given.
// It starts a Lean of its own and touches neither the app nor the database.

import { checkWithLean, coverage, spokenCoverage } from "../web/server/contentcheck.ts";
import { LeanServer, leanProblem } from "../web/server/lean/lsp.ts";
import { contentDir, loadContent } from "../web/server/loader.ts";

const USAGE = `npm run check:content [-- options]
  --no-lean        structure only; nothing is checked against Lean
  --lean           fail, do not skip, when Lean is not installed
  --lesson <id>    the Lean pass for one lesson (may be repeated; also --lesson=<id>)
  --gaps           also list what the curriculum promises and does not yet have`;

const flags = new Set<string>();
const only: string[] = [];
const wrong: string[] = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === "--help" || arg === "-h") {
    console.log(USAGE);
    process.exit(0);
  } else if (arg === "--lesson" || arg.startsWith("--lesson=")) {
    const id = arg === "--lesson" ? args[++i] : arg.slice("--lesson=".length);
    if (!id || id.startsWith("-")) wrong.push("--lesson needs a lesson id.");
    else only.push(id);
  } else if (arg === "--no-lean" || arg === "--lean" || arg === "--gaps") flags.add(arg);
  else wrong.push(`Unknown option ${arg}.`);
}
if (flags.has("--lean") && flags.has("--no-lean")) wrong.push("--lean and --no-lean cannot both be given.");
if (wrong.length) {
  console.error(`${wrong.join("\n")}\n${USAGE}`);
  process.exit(2);
}

const dir = contentDir();
const content = loadContent(dir);
let failed = content.problems.length;
for (const p of content.problems) console.log(`✖ ${p.file}: ${p.message}`);
const perLevel = content.levels.map((l) => `L${l.id}: ${content.lessons.filter((x) => x.level === l.id).length}`).join("  ");
const exercises = content.lessons.reduce((n, l) => n + l.exercises.length, 0);
console.log(`Structure: ${content.lessons.length} lessons and ${exercises} exercises read (${perLevel}), ${content.problems.length} refused.`);

const missing = only.filter((id) => !content.lessons.some((l) => l.id === id));
if (missing.length) {
  console.log(`✖ no lesson with id ${missing.join(", ")} was read (a lesson the structure check refused cannot be checked with Lean)`);
  failed += missing.length;
}

const notInstalled = leanProblem();
if (flags.has("--no-lean")) {
  console.log("Lean: not run (--no-lean). No solution and no snippet was checked.");
} else if (notInstalled) {
  console.log(`Lean: SKIPPED, no solution and no snippet was checked. ${notInstalled}`);
  if (flags.has("--lean")) failed++;
} else {
  const lean = new LeanServer();
  const started = Date.now();
  try {
    const pass = await checkWithLean(lean, content, {
      dir,
      only,
      onLesson: (lesson, problems, n) => {
        for (const p of problems) console.log(`✖ ${p.file}: ${p.message}`);
        const some = (count: number, what: string) => (count ? `, ${count} ${what}${count === 1 ? "" : "s"}` : "");
        if (!problems.length) console.log(`✔ ${lesson.file}: ${n.solutions} solution${n.solutions === 1 ? "" : "s"}${some(n.snippets, "snippet")}${some(n.signatures, "library name")}`);
      },
      onGallery: (problems, proofs) => {
        for (const p of problems) console.log(`✖ ${p.file}: ${p.message}`);
        if (!problems.length) console.log(`✔ gallery.yaml: ${proofs} famous proof${proofs === 1 ? "" : "s"}`);
      },
    });
    failed += pass.problems.length;
    const c = pass.counts;
    console.log(
      `Lean: ${c.lessons} lessons in ${Math.round((Date.now() - started) / 1000)} s. ${c.solutions} reference solutions, ${c.famous ? `${c.famous} famous proofs, ` : ""}${c.options} wrong options, ${c.snippets} snippets and ${c.signatures} library names checked; ` +
        `${pass.problems.length} problem${pass.problems.length === 1 ? "" : "s"}. ${c.fragments} snippets are fragments (a proof state, a few tactic lines, an outline) and were not compiled.`,
    );
  } catch (e) {
    console.log(`✖ Lean could not finish the check: ${(e as Error).message}`);
    failed++;
  } finally {
    lean.close();
  }
}

if (flags.has("--gaps")) {
  const gaps = coverage(content);
  const list = (title: string, items: string[]) => console.log(items.length ? `${title}\n${items.map((i) => `  - ${i}`).join("\n")}` : `${title} none`);
  console.log("\nGaps (a list to write from; never a failure)");
  list("Concepts a lesson lists that no exercise tests:", gaps.untested.map((g) => `${g.concept} (${g.lesson})`));
  list("Moves a level says it introduces that no exercise up to that level uses:", gaps.unexercised.map((g) => `level ${g.level}: ${g.moves.join(", ")}`));
  list("Levels with no lesson yet:", gaps.empty.map(String));
  list("Topics still to be written:", gaps.topics.map((t) => `level ${t.level}: ${t.topic}`));
  list("Lessons planned and not yet written:", gaps.planned.map((p) => `level ${p.level}: ${p.id} (${p.title})`));
  const spoken = spokenCoverage(content);
  list("Formulas with no spoken form that Listen mode is not sure how to say (write `code`{say: …}; shown with what is said now):", spoken.formulas.map((f) => `${f.lesson}: \`${f.code}\` is said "${f.said}"${f.claim ? " (in an exercise's title or claim, which is shown as written: reword it there, a form would be seen)" : ""}`));
  list("Symbols in running text that Listen mode has no word for (web/shared/tts/say.ts):", spoken.symbols.map((s) => `${s.lesson}: ${s.symbols.join(" ")}`));
}

console.log(failed ? `\n${failed} problem${failed === 1 ? "" : "s"}.` : "\nNo problems.");
process.exit(failed ? 1 : 0);
