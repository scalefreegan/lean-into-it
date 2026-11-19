import { useCallback, useRef, useState } from "react";
import { explain } from "../../shared/explain.ts";
import { negation, readAnswer, splitStatement, writeAnswer, type Side } from "../../shared/truefalse.ts";
import type { CheckReply } from "../../shared/wire.ts";
import { ApiError, check } from "../api/client.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { Closed, Refusal } from "../proof/GoalCards.tsx";
import { TypedProof } from "../proof/TypedProof.tsx";
import { useTutorWork } from "../tutor/store.ts";
import { Button, cx, Notice } from "../ui.tsx";
import { Claim } from "./Claim.tsx";
import type { ExerciseProps } from "./types.ts";

/** Kind `truefalse` (web/shared/truefalse.ts): say whether the claim holds,
 *  then back it up. The true side is a typed proof; the false side a value
 *  for each variable (and, where the exercise asks, the proof that they
 *  work). Lean decides; nothing here knows the answer. */
export function TrueOrFalse(props: ExerciseProps) {
  const { lessonId, exercise, solution, onSolved } = props;
  const tf = exercise.truefalse!;
  const before = solution ? readAnswer(solution) : null;
  const kept = before && typeof before !== "string" ? before : null;
  const [side, setSide] = useState<Side | null>(kept?.side ?? null);
  /** The side asked about and refused, with the reason. */
  const [refused, setRefused] = useState<{ side: Side; why: string } | null>(null);
  const [values, setValues] = useState<string[]>(() => tf.names.map((_, i) => kept?.values[i] ?? ""));
  const [checked, setChecked] = useState<{ values: string; reply: CheckReply } | null>(null);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const told = useRef(false);
  const [won, setWon] = useState(false);
  const split = splitStatement(exercise.statement);

  const solved = (answer: string) => {
    if (told.current) return;
    told.current = true;
    setWon(true);
    onSolved(answer);
  };

  async function choose(next: Side) {
    setBusy(true);
    setTrouble(null);
    try {
      // Choosing the side Lean has not backed up is an attempt, and is answered at once.
      const reply = await check({ lessonId, exerciseId: exercise.id, body: next, record: "submitted" });
      if (reply.refusal) setRefused({ side: next, why: reply.refusal });
      else {
        setRefused(null);
        setSide(next);
      }
    } catch (e) {
      setTrouble(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const answerOf = useCallback((body: string) => writeAnswer({ side: "false", values, body }), [values]);
  const trueAnswer = useCallback((body: string) => writeAnswer({ side: "true", values: [], body }), []);

  async function checkValues() {
    const answer = answerOf("");
    setBusy(true);
    setTrouble(null);
    try {
      const reply = await check({ lessonId, exerciseId: exercise.id, body: answer, record: "submitted" });
      setChecked({ values: answer, reply });
      if (reply.solved) solved(answer);
    } catch (e) {
      setTrouble(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const reply = checked && checked.values === answerOf("") ? checked.reply : null;
  const done = !!reply?.solved || (won && !reply);
  useTutorWork(lessonId, exercise.id, {
    body: side === null ? "" : side === "true" ? "(proving it true)" : `(a counterexample: ${tf.names.map((n, i) => `${n} = ${values[i] || "?"}`).join(", ")})`,
    goals: null,
    error: refused?.why ?? reply?.refusal ?? null,
  });

  return (
    <>
      <Claim exercise={exercise} />
      <div data-truefalse={exercise.id} className="overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-sm">
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <pre className="lean overflow-x-auto rounded-xl border border-line bg-raised/60 px-3 py-2 text-sm text-fg-2">{`claim ${exercise.statement}`}</pre>
          <div role="group" aria-label="Is the claim true or false?" className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-fg-2">This claim is</span>
            {(["true", "false"] as const).map((s) => (
              <Button key={s} data-side={s} aria-pressed={side === s} variant={side === s ? "primary" : undefined} disabled={busy} onClick={() => void choose(s)}>
                {s === "true" ? "True: prove it" : "False: find a counterexample"}
              </Button>
            ))}
          </div>
          {trouble && <Notice tone="warn">{trouble}</Notice>}
          {refused && (
            <div data-wrong-side>
              <Notice tone="warn">{refused.why}</Notice>
            </div>
          )}
        </div>

        {side === "false" && (
          <div className="flex flex-col gap-3 border-t border-line p-4 sm:p-5">
            <p className="text-sm text-fg-2">
              A counterexample is a value for {tf.names.length === 1 ? "the variable" : "each variable"} at which the claim fails. Lean checks it by proving the claim's negation:
            </p>
            {split && <pre className="lean overflow-x-auto rounded-xl border border-line bg-raised/60 px-3 py-2 text-sm text-fg-3">{`example ${negation(split)}`}</pre>}
            <div className="flex flex-wrap items-center gap-3">
              {tf.names.map((name, i) => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <span className="lean text-fg">{name} =</span>
                  <input
                    data-value={name}
                    value={values[i]}
                    onChange={(e) => setValues((vs) => vs.map((v, j) => (j === i ? e.target.value : v)))}
                    onKeyDown={(e) => e.key === "Enter" && tf.witness === "values" && !busy && values.every((v) => v.trim()) && void checkValues()}
                    spellCheck={false}
                    autoComplete="off"
                    inputMode="decimal"
                    className={cx("lean w-24 rounded-md border-2 bg-panel px-2 leading-7 text-fg outline-none focus:border-accent", reply?.solved ? "border-good" : reply ? "border-bad" : "border-line-strong")}
                  />
                </label>
              ))}
              {tf.witness === "values" && (
                <Button variant="primary" onClick={() => void checkValues()} disabled={busy || !values.every((v) => v.trim())}>
                  Check
                </Button>
              )}
            </div>
            {tf.witness === "values" && (
              <div aria-live="polite" className="flex flex-col gap-2">
                {busy && <span className="text-sm text-fg-3">Lean is checking…</span>}
                {done && (
                  <Closed>
                    <strong>A counterexample.</strong> Lean has proved the claim fails there, so it is false.
                  </Closed>
                )}
                {reply && !reply.solved && (
                  <>
                    {reply.forbidden.length > 0 && <Notice tone="warn">{`${reply.forbidden.join(", ")} is switched off here.`}</Notice>}
                    {reply.refusal && <Notice tone="warn">{reply.refusal}</Notice>}
                    {reply.diagnostics
                      .filter((d) => d.severity === "error")
                      .slice(0, 1)
                      .map((d, i) => (
                        <Refusal key={i} plain={explain(d.message) ?? d.message.split("\n")[0]} raw={d.message} />
                      ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {side === "true" && (
        <ErrorBoundary label={`exercise ${exercise.id}`}>
          <TypedProof lessonId={lessonId} exercise={exercise} solution={kept?.side === "true" ? kept.body : undefined} encode={trueAnswer} onSolved={solved} />
        </ErrorBoundary>
      )}
      {side === "false" && tf.witness === "proof" && (
        <ErrorBoundary label={`exercise ${exercise.id}`}>
          <TypedProof
            lessonId={lessonId}
            exercise={exercise}
            solution={kept?.side === "false" ? kept.body : undefined}
            encode={answerOf}
            header={`-- hc: the claim at ${tf.names.map((n, i) => `${n} = ${values[i] || "?"}`).join(", ")}. Show it is False.`}
            onSolved={solved}
          />
        </ErrorBoundary>
      )}
    </>
  );
}
