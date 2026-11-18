// For tests: the complete example lesson printed in docs/CONTENT.md, written
// out as a content folder, so that what the document shows is what is checked.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The complete lesson docs/CONTENT.md prints, in a content folder of its own. */
export function documentedLesson(): { dir: string; file: string } {
  const doc = fs.readFileSync(path.resolve(import.meta.dirname, "../../docs/CONTENT.md"), "utf8");
  const m = /^## A complete lesson\r?\n(?:(?!## )[\s\S])*?^`````[^\n]*\r?\n([\s\S]*?)\r?\n`````\s*$/m.exec(doc);
  assert.ok(m, 'docs/CONTENT.md must have, under "## A complete lesson", the lesson file in a fence of five backticks');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lii-doc-"));
  fs.writeFileSync(path.join(dir, "curriculum.yaml"), "tracks:\n  - id: logic\n    title: Logic\n    summary: s\nlevels:\n  - id: 1\n    title: One\n    summary: s\n");
  fs.mkdirSync(path.join(dir, "lessons", "logic"), { recursive: true });
  fs.writeFileSync(path.join(dir, "lessons", "logic", "1-08-chains-of-reasons.md"), `${m[1]}\n`);
  return { dir, file: "lessons/logic/1-08-chains-of-reasons.md" };
}
