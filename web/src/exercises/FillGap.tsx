import { useEffect, useRef, useState } from "react";
import { explain } from "../../shared/explain.ts";
import { bodyLines, GAP, gapLine } from "../../shared/proof.ts";
import type { CheckReply } from "../../shared/wire.ts";
import { ApiError, check } from "../api/client.ts";
import { Closed, GoalView, Refusal } from "../proof/GoalCards.tsx";
import { Button, cx, Notice } from "../ui.tsx";
import { Claim } from "./Claim.tsx";
import type { ExerciseProps } from "./types.ts";

/** Kind `fill`: a proof with one step missing. The learner types the step,
 *  or picks it from the exercise's options; Lean checks the proof with it
 *  in place. Nothing here knows which answer is right. */
export function FillGap({ lessonId, exercise, solution, onSolved }: ExerciseProps) {
  const [answer, setAnswer] = useState(solution ?? "");
  /** What Lean said about `checked.answer`; shown while the gap still holds it. */
  const [checked, setChecked] = useState<{ answer: string; reply: CheckReply } | null>(null);
  /** The state the gap's line starts from, asked for once with the gap empty. */
  const [opening, setOpening] = useState<CheckReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const told = useRef(false);

  const lines = bodyLines(exercise.proof);
  const at = gapLine(exercise.proof);
  const choosing = exercise.options.length > 0;

  async function ask(fill: string, record: boolean) {
    setBusy(true);
    setTrouble(null);
    try {
      const reply = await check({ lessonId, exerciseId: exercise.id, body: fill, ...(record ? { record: "submitted" as const } : {}) });
      if (fill.trim()) setChecked({ answer: fill, reply });
      else setOpening(reply);
      if (reply.solved && !told.current) {
        told.current = true;
        onSolved(fill);
      }
    } catch (e) {
      setTrouble(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // On arrival: the state at the gap, and Lean's word on an answer kept from before.
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    void ask("", false).then(() => (solution?.trim() ? ask(solution, false) : undefined));
  });

  const reply = checked && checked.answer === answer ? checked.reply : null;
  const solved = !!reply?.solved;
  const errors = (reply?.diagnostics ?? []).filter((d) => d.severity === "error" && d.line !== null && !(reply?.error && /^unsolved goals/.test(d.message)));
  const wrong = !!reply && !solved;
  const goals = reply?.cursorGoals ?? opening?.cursorGoals ?? null;
  const [before, after] = at < 0 ? ["", ""] : lines[at].split(GAP);

  return (
    <>
      <Claim exercise={exercise} />
      <div data-fill={exercise.id} className="overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-sm">
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="overflow-x-auto rounded-xl border border-line bg-raised/60">
              <pre className="lean border-b border-line px-3 py-2 text-sm text-fg-3">{`example ${exercise.statement} := by`}</pre>
              <div className="lean px-3 py-2 text-sm leading-8 text-fg">
                {lines.map((line, i) =>
                  i !== at ? (
                    <div key={i} className="whitespace-pre pl-4">
                      {line || " "}
                    </div>
                  ) : (
                    <div key={i} className="flex items-center whitespace-pre pl-4">
                      {before}
                      {choosing ? (
                        <span
                          data-gap
                          className={cx(
                            "inline-block min-w-16 rounded-md border-2 px-2 text-center leading-7",
                            solved ? "border-good bg-good-soft" : wrong ? "border-warn bg-warn-soft" : "border-dashed border-accent bg-panel text-fg-3",
                          )}
                        >
                          {answer || "?"}
                        </span>
                      ) : (
                        <input
                          data-gap
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && answer.trim() && !busy && void ask(answer, true)}
                          aria-label="The missing step"
                          spellCheck={false}
                          autoCapitalize="off"
                          autoComplete="off"
                          placeholder="?"
                          style={{ width: `${Math.max(10, answer.length + 3)}ch` }}
                          className={cx(
                            "lean max-w-full rounded-md border-2 bg-panel px-2 leading-7 text-fg outline-none focus:border-solid focus:border-accent",
                            solved ? "border-good" : wrong ? "border-warn" : "border-dashed border-accent",
                          )}
                        />
                      )}
                      {after}
                    </div>
                  ),
                )}
              </div>
            </div>

            {choosing ? (
              <div role="group" aria-label="What goes in the gap?" className="flex flex-wrap gap-2">
                {exercise.options.map((option) => (
                  <Button
                    key={option}
                    data-option={option}
                    aria-pressed={answer === option}
                    disabled={busy}
                    onClick={() => {
                      setAnswer(option);
                      void ask(option, true);
                    }}
                    className={cx("lean", answer === option && "border-accent bg-accent-soft")}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={() => void ask(answer, true)} disabled={busy || !answer.trim()}>
                  Check
                </Button>
              </div>
            )}
            <span className="text-sm text-fg-3" aria-live="polite">
              {busy ? "Lean is checking…" : solved ? "Lean accepts the proof with this in the gap." : ""}
            </span>
          </div>

          <div className="min-w-0" aria-live="polite">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">{solved ? "Proof state" : "Where the line with the gap starts"}</div>
            {trouble ? (
              <Notice tone="warn">{trouble}</Notice>
            ) : solved ? (
              <Closed>
                <strong>No goals left.</strong> Lean accepts this proof.
              </Closed>
            ) : !goals ? (
              <div className="py-6 text-sm text-fg-3">Waking Lean up…</div>
            ) : goals.length === 0 ? (
              <div className="py-6 text-sm text-fg-3">Nothing to show at this point.</div>
            ) : (
              <GoalView goals={goals} />
            )}
          </div>
        </div>

        {wrong && (
          <div data-fill-verdict className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:px-5">
            {reply.forbidden.length > 0 && (
              <Notice tone="warn">
                This exercise is about finding the step yourself, so <code className="font-mono">{reply.forbidden.join(", ")}</code> is switched off here.
              </Notice>
            )}
            {reply.refusal && <Notice tone="warn">{reply.refusal}</Notice>}
            {errors.map((d, i) => (
              <Refusal key={i} plain={`${d.line === at ? "In the gap" : `Line ${(d.line as number) + 1}`}: ${explain(d.message) ?? d.message.split("\n")[0]}`} raw={d.message} />
            ))}
            {errors.length === 0 && reply.forbidden.length === 0 && !reply.refusal && (
              <Notice tone="warn">Lean can read that step, but the proof does not finish with it: something is still left to show.</Notice>
            )}
          </div>
        )}
      </div>
    </>
  );
}
