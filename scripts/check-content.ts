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

import { checkWithLean, coverage } from "../web/server/contentcheck.ts";
import { LeanServer, leanProblem } from "../web/server/lean/lsp.ts";
import { contentDir, loadContent } from "../web/server/loader.ts";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const only = args.flatMap((a, i) => (a === "--lesson" && args[i + 1] ? [args[i + 1]!] : []));
const known = ["--no-lean", "--lean", "--lesson", "--gaps"];
const unknown = [...flags].filter((f) => !known.includes(f));
if (unknown.length || (flags.has("--lean") && flags.has("--no-lean")) || (flags.has("--lesson") && !only.length)) {
  console.error(unknown.length ? `Unknown option ${unknown.join(", ")}.` : flags.has("--lesson") ? "--lesson needs a lesson id." : "--lean and --no-lean cannot both be given.");
  console.error(`Options: ${known.join(", ")}`);
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
        if (!problems.length) console.log(`✔ ${lesson.file}: ${n.solutions} solution${n.solutions === 1 ? "" : "s"}${n.snippets ? `, ${n.snippets} snippet${n.snippets === 1 ? "" : "s"}` : ""}`);
      },
    });
    failed += pass.problems.length;
    const c = pass.counts;
    console.log(
      `Lean: ${c.lessons} lessons in ${Math.round((Date.now() - started) / 1000)} s. ${c.solutions} reference solutions, ${c.options} wrong options, ${c.snippets} snippets and ${c.signatures} library names checked; ` +
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
  console.log("Formulas with no spoken form: not applicable yet. Lessons have no spoken forms until Listen mode (lii-1gs.1).");
}

console.log(failed ? `\n${failed} problem${failed === 1 ? "" : "s"}.` : "\nNo problems.");
process.exit(failed ? 1 : 0);
