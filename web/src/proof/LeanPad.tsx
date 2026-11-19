import { useState } from "react";
import type { Position } from "../../shared/proof.ts";
import { playground } from "../api/client.ts";
import { useLive } from "./useLive.ts";
import { Closed, GoalView } from "./GoalCards.tsx";
import { LeanEditor, SymbolHelp } from "./LeanEditor.tsx";
import { cx, Notice } from "../ui.tsx";

// A whole Lean file with what Lean says about it beside it: the facts and
// goal at the cursor, and every message. Nothing is graded and nothing is
// recorded (/api/playground). The Playground is one of these; the Lab opens
// one on each example. One at a time on a page: they share one Lean document.

export function LeanPad({ source, onChange, label, rows = 18, startAt = { line: 0, character: 0 } }: { source: string; onChange: (text: string) => void; label: string; rows?: number; startAt?: Position }) {
  const [caret, setCaret] = useState<Position>(startAt);
  const live = useLive({ source, caret }, (k, signal) => playground({ source: k.source, cursor: k.caret }, signal), 450);

  const diagnostics = live.reply?.diagnostics ?? [];
  const errors = diagnostics.filter((d) => d.severity === "error");
  const goals = live.reply?.cursorGoals ?? null;
  // Names to complete: those of the goal at the caret, or of the last goal
  // there was (just after a line Lean refused it reports no goal at all).
  const here = (goals ?? []).flatMap((g) => g.hypotheses.flatMap((h) => h.names));
  const [names, setNames] = useState<string[]>([]);
  if (here.length && here.join(" ") !== names.join(" ")) setNames(here);

  return (
    <div className="flex flex-col gap-4" data-lean-pad>
      {live.trouble && <Notice tone="warn">{live.trouble}</Notice>}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-2">
          <LeanEditor
            label={label}
            value={source}
            startAt={startAt}
            rows={rows}
            errorLines={errors.map((d) => d.line)}
            marks={diagnostics}
            stale={live.checking || !!live.trouble}
            names={names}
            onChange={(text, c) => {
              setCaret(c);
              onChange(text);
            }}
            onCaret={setCaret}
          />
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
