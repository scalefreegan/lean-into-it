import { useEffect, useRef, useState } from "react";
import type { Exercise } from "../../shared/content.ts";
import { explain, suggestion } from "../../shared/explain.ts";
import type { Position } from "../../shared/proof.ts";
import type { CheckReply } from "../../shared/wire.ts";
import { ApiError, check } from "../api/client.ts";
import { Button, Notice } from "../ui.tsx";
import { unsolvedGoals } from "../../shared/goals.ts";
import { Closed, GoalView, Refusal } from "./GoalCards.tsx";
import { LeanEditor, SymbolHelp } from "./LeanEditor.tsx";
import { useLive } from "./useLive.ts";
import { useTutorWork } from "../tutor/store.ts";

// A proof typed as Lean. The statement is fixed; the learner writes the
// tactic lines. The panel beside the editor shows the goal state at the
// caret, as cards, and refreshes a moment after each pause in typing.

interface Props {
  lessonId: string;
  exercise: Exercise;
  solution?: string;
  onSolved: (body: string) => void;
}

export function TypedProof({ lessonId, exercise, solution, onSolved }: Props) {
  const [body, setBody] = useState(solution ?? "");
  const [caret, setCaret] = useState<Position>({ line: 0, character: 0 });
  const [submitted, setSubmitted] = useState<{ body: string; reply: CheckReply } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const told = useRef(false);

  // Re-checking the stored solution the exercise opened with is not an attempt.
  const opening = useRef(solution);
  const live = useLive({ body, caret }, (k, signal) =>
    check({ lessonId, exerciseId: exercise.id, body: k.body, cursor: k.caret, ...(k.body === opening.current ? {} : { record: "live" as const }) }, signal),
  );
  const reply = live.reply;

  // Lean accepting the proof is the finish line, whether or not Check was pressed.
  useEffect(() => {
    if (reply?.solved && !live.checking && !told.current) {
      told.current = true;
      onSolved(body);
    }
  }, [reply, live.checking, body, onSolved]);

  async function submit() {
    setSubmitting(true);
    setTrouble(null);
    try {
      const r = await check({ lessonId, exerciseId: exercise.id, body, record: "submitted" });
      setSubmitted({ body, reply: r });
      if (r.solved && !told.current) {
        told.current = true;
        onSolved(body);
      }
    } catch (e) {
      setTrouble(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const solved = !!reply?.solved && !live.checking;
  // Where a line is wrong, Lean may also report the goal that line left
  // open ("unsolved goals"). Beside the real error it would read "every line
  // is fine so far", so it is shown only when nothing else is wrong.
  const errors = (reply?.diagnostics ?? []).filter((d) => d.severity === "error" && d.line !== null && !(reply?.error && /^unsolved goals/.test(d.message)));
  // What `exact?` found, where the exercise allows searching.
  const found = live.checking || exercise.forbid.includes("exact?") ? [] : (reply?.diagnostics ?? []).flatMap((d) => (d.severity === "info" ? [suggestion(d.message)] : [])).filter((x): x is string => x !== null);
  const verdict = submitted && submitted.body === body ? submitted.reply : null;
  const goals = reply ? (reply.cursorGoals ?? reply.goals) : null;
  // No goal at this point, yet the proof is unfinished: a case left open
  // elsewhere (a bullet never started). Lean's "unsolved goals" error names it.
  const stillOpen = reply && goals?.length === 0 && !reply.solved && !reply.refusal ? unsolvedGoals(reply.diagnostics) : [];
  const empty = !body.trim();
  useTutorWork(lessonId, exercise.id, { body, goals: stillOpen.length ? stillOpen : goals, error: reply?.error ? `${reply.error.line !== null ? `line ${reply.error.line + 1}: ` : ""}${reply.error.message}` : (reply?.refusal ?? null) });

  return (
    <div data-typed={exercise.id} className="overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-sm">
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <LeanEditor
            label={`Proof of: ${exercise.says}`}
            header={`example ${exercise.statement} := by`}
            value={body}
            rows={7}
            errorLines={errors.map((d) => d.line as number)}
            onChange={(text, c) => {
              setBody(text);
              setCaret(c);
            }}
            onCaret={setCaret}
          />
          <SymbolHelp />
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={submit} disabled={submitting || empty}>
              Check
            </Button>
            <span className="text-sm text-fg-3" aria-live="polite">
              {live.checking ? "Lean is checking…" : solved ? "Lean accepts this proof." : ""}
            </span>
          </div>
        </div>

        <div className="min-w-0" aria-live="polite">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">
            {solved ? "Proof state" : stillOpen.length ? "Still open" : reply?.cursorGoals ? `At line ${caret.line + 1}` : "After your last line"}
          </div>
          {live.trouble || trouble ? (
            <Notice tone="warn">{live.trouble ?? trouble}</Notice>
          ) : !goals ? (
            <div className="py-6 text-sm text-fg-3">Waking Lean up…</div>
          ) : solved ? (
            <Closed>
              <strong>No goals left.</strong> Lean accepts this proof.
            </Closed>
          ) : goals.length === 0 && stillOpen.length ? (
            <div data-still-open>
              <p className="mb-2 text-sm text-fg-2">Nothing is left to prove here, but {stillOpen.length === 1 ? "this case is" : "these cases are"} not finished yet:</p>
              <GoalView goals={stillOpen} />
            </div>
          ) : goals.length === 0 ? (
            // No goal here, yet Lean has not accepted the proof: it could not be
            // read this far, or was refused, or another case is still open.
            <div className="py-6 text-sm text-fg-3">{reply?.refusal ? "This proof is not accepted. The note below says why." : "Nothing to show at this point, but the proof is not finished yet."}</div>
          ) : (
            <GoalView goals={goals} />
          )}
        </div>
      </div>

      {found.length > 0 && (
        <div className="border-t border-line px-4 py-3 sm:px-5" data-suggestion>
          <Notice tone="good">
            Lean searched its library and suggests: <code className="font-mono">{found[0]}</code>. In finished work that line goes in place of the search.
          </Notice>
        </div>
      )}

      {reply && !solved && (errors.length > 0 || reply.forbidden.length > 0 || reply.refusal || verdict) && (
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:px-5">
          {reply.forbidden.length > 0 && (
            <Notice tone="warn">
              This exercise is about doing the steps yourself, so <code className="font-mono">{reply.forbidden.join(", ")}</code> is switched off here.
            </Notice>
          )}
          {reply.refusal && <Notice tone="warn">{reply.refusal}</Notice>}
          {errors.map((d, i) => (
            <Refusal key={i} plain={`Line ${(d.line as number) + 1}: ${explain(d.message) ?? d.message.split("\n")[0]}`} raw={d.message} />
          ))}
          {verdict && !verdict.solved && errors.length === 0 && reply.forbidden.length === 0 && !reply.refusal && (
            <Notice tone="warn">{empty ? "Nothing to check yet." : "Not finished: every line is fine, but there is still something left to show. The panel says what."}</Notice>
          )}
        </div>
      )}
    </div>
  );
}
