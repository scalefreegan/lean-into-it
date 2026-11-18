import { useState } from "react";
import { useTutorSource } from "../tutor/store.ts";
import type { Position } from "../../shared/proof.ts";
import { playground } from "../api/client.ts";
import { Closed, GoalView } from "../proof/GoalCards.tsx";
import { LeanEditor, SymbolHelp } from "../proof/LeanEditor.tsx";
import { useLive } from "../proof/useLive.ts";
import { Button, cx, Notice } from "../ui.tsx";

// The Playground: any Lean, nothing scored, nothing recorded. The whole file
// is yours, statement included. The text is kept in this browser only.

const STARTER = `import Mathlib

-- Nothing here is scored. Change anything and watch the panel.
-- Put the cursor inside a proof to see the facts and the goal at that line.

example (P Q : Prop) (hP : P) (hPQ : P → Q) : Q := by
  apply hPQ
  exact hP

example (a b : ℝ) : (a + b)^2 = a^2 + 2*a*b + b^2 := by
  ring

#eval (List.range 10).map (fun n => n * n)
`;

const KEY = "lean-into-it:playground";

function stored(): string {
  try {
    return localStorage.getItem(KEY) ?? STARTER;
  } catch {
    return STARTER;
  }
}

export function Playground() {
  const [source, setSource] = useState(stored);
  const [caret, setCaret] = useState<Position>({ line: 0, character: 0 });
  useTutorSource(source);
  const live = useLive({ source, caret }, (k, signal) => playground({ source: k.source, cursor: k.caret }, signal), 450);

  function change(text: string, c: Position) {
    setSource(text);
    setCaret(c);
    try {
      localStorage.setItem(KEY, text);
    } catch {
      /* private window: the text just isn't kept */
    }
  }

  const diagnostics = live.reply?.diagnostics ?? [];
  const errors = diagnostics.filter((d) => d.severity === "error");
  const goals = live.reply?.cursorGoals ?? null;

  return (
    <div className="mx-auto flex max-w-[2400px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold text-fg">Playground</h1>
          <p className="mt-1 text-fg-2">Free Lean with all of Mathlib. Nothing is scored and nothing is recorded.</p>
        </div>
        <Button onClick={() => change(STARTER, { line: 0, character: 0 })}>Reset to the starter</Button>
      </header>

      {live.trouble && <Notice tone="warn">{live.trouble}</Notice>}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-2">
          <LeanEditor label="Lean playground" value={source} rows={18} errorLines={errors.map((d) => d.line)} onChange={change} onCaret={setCaret} />
          <SymbolHelp />
        </div>

        <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
          <section className="rounded-2xl border border-line-strong bg-panel p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-fg-3">
              <span>At line {caret.line + 1}</span>
              <span>{live.checking ? "Lean is checking…" : ""}</span>
            </div>
            {!live.reply ? (
              <p className="text-sm text-fg-3">Waking Lean up…</p>
            ) : goals === null ? (
              <p className="text-sm text-fg-3">Put the cursor inside a proof (after “by”) to see its facts and goal.</p>
            ) : goals.length === 0 ? (
              <Closed>No goals at this line.</Closed>
            ) : (
              <GoalView goals={goals} />
            )}
          </section>

          <section className="rounded-2xl border border-line-strong bg-panel p-4" data-messages>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">Messages</div>
            {live.reply && diagnostics.length === 0 ? (
              <p className="text-sm text-good">No errors. Lean accepts the whole file.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {diagnostics.map((d, i) => (
                  <li key={i} className={cx("rounded-lg border px-3 py-2 text-xs", d.severity === "error" ? "border-bad bg-bad-soft" : d.severity === "warning" ? "border-warn bg-warn-soft" : "border-line bg-raised")}>
                    <span className="font-semibold text-fg-2">Line {d.line + 1}</span>
                    <pre className="lean mt-1 text-fg">{d.message}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
