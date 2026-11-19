import { useEffect, useRef, useState } from "react";
import type { Goal } from "../../shared/goals.ts";
import { optionGoals, shuffled } from "../../shared/recognize.ts";
import type { CheckReply } from "../../shared/wire.ts";
import { ApiError, check } from "../api/client.ts";
import { Closed, GoalView } from "../proof/GoalCards.tsx";
import { useTutorWork } from "../tutor/store.ts";
import { Button, cx, Notice } from "../ui.tsx";
import { Claim } from "./Claim.tsx";
import type { ExerciseProps } from "./types.ts";

// Kinds `predict`, `read` and `match` (web/shared/recognize.ts): reading
// Lean. A prediction is decided by Lean on the server; a reading and a
// match are marked against the author's answer, also on the server, so the
// page never decides.

/** Send an answer and keep the reply; tell the lesson once it is solved. */
function useAnswer({ lessonId, exercise, onSolved }: ExerciseProps) {
  const [reply, setReply] = useState<{ answer: string; reply: CheckReply } | null>(null);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const told = useRef(false);
  async function send(answer: string) {
    setBusy(true);
    setTrouble(null);
    try {
      const r = await check({ lessonId, exerciseId: exercise.id, body: answer, record: "submitted" });
      setReply({ answer, reply: r });
      if (r.solved && !told.current) {
        told.current = true;
        onSolved(answer);
      }
    } catch (e) {
      setTrouble(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return { reply, busy, trouble, send };
}

const card = "overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-sm";

/** Kind `predict`: the state before a move, the move, and states to choose from. */
export function Predict(props: ExerciseProps) {
  const { lessonId, exercise, solution } = props;
  const { move } = exercise.predict!;
  const { reply, busy, trouble, send } = useAnswer(props);
  const [start, setStart] = useState<Goal[] | null>(null);
  const [startTrouble, setStartTrouble] = useState<string | null>(null);
  const order = shuffled(exercise.options.length, exercise.id);
  const picked = reply?.answer ?? solution ?? null;

  // The state the move starts from, as Lean has it.
  useEffect(() => {
    const abort = new AbortController();
    check({ lessonId, exerciseId: exercise.id, body: "" }, abort.signal).then(
      (r) => (r.refusal ? setStartTrouble(r.refusal) : setStart(r.cursorGoals ?? [])),
      (e: Error) => !abort.signal.aborted && e.name !== "AbortError" && setStartTrouble(e instanceof ApiError ? e.message : String(e)),
    );
    return () => abort.abort();
  }, [lessonId, exercise.id]);

  useTutorWork(lessonId, exercise.id, { body: picked ? `(predicted after \`${move}\`)\n${picked}` : "", goals: start, error: reply && !reply.reply.solved ? (reply.reply.refusal ?? "That is not the state Lean leaves.") : null });

  return (
    <>
      <Claim exercise={exercise} />
      <div data-predict={exercise.id} className={card}>
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">Before the move</div>
            {startTrouble ? <Notice tone="warn">{startTrouble}</Notice> : start ? <GoalView goals={start} /> : <div className="py-6 text-sm text-fg-3">Waking Lean up…</div>}
          </div>
          <div className="min-w-0">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">The move</div>
            <pre className="lean overflow-x-auto rounded-xl border border-line bg-raised/60 px-3 py-2 text-sm text-fg">{move}</pre>
            <p className="mt-3 text-sm text-fg-2">What does the goal become? Choose the state Lean will show.</p>
          </div>
        </div>
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 sm:p-5" role="group" aria-label="States to choose from">
          {order.map((i) => {
            const option = exercise.options[i];
            const chosen = picked === option;
            const right = chosen && (reply ? reply.reply.solved : !!solution);
            return (
              <button
                key={i}
                type="button"
                data-option={i}
                aria-pressed={chosen}
                disabled={busy}
                onClick={() => void send(option)}
                className={cx("rounded-xl border-2 p-3 text-left transition-colors hover:border-accent", chosen ? (right ? "border-good" : "border-bad") : "border-line")}
              >
                <GoalView goals={optionGoals(option)} />
              </button>
            );
          })}
        </div>
        <div aria-live="polite" className="flex flex-col gap-2 border-t border-line px-4 py-3 empty:hidden sm:px-5">
          {busy && <span className="text-sm text-fg-3">Lean is running the move…</span>}
          {trouble && <Notice tone="warn">{trouble}</Notice>}
          {reply?.reply.refusal && <Notice tone="warn">{reply.reply.refusal}</Notice>}
          {reply && !reply.reply.refusal && (
            <div data-verdict={reply.reply.solved ? "right" : "wrong"}>
              {reply.reply.solved ? (
                <Closed>
                  <strong>Right.</strong> That is the state Lean leaves after <code className="font-mono">{move}</code>.
                </Closed>
              ) : (
                <>
                  <Notice tone="warn">Not that one. Lean ran the move, and this is what it left:</Notice>
                  <div className="mt-2">
                    <GoalView goals={reply.reply.goals} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Kind `read`: a Lean statement and sentences; choose the one that says it. */
export function Read(props: ExerciseProps) {
  const { lessonId, exercise, solution } = props;
  const { reply, busy, trouble, send } = useAnswer(props);
  const order = shuffled(exercise.options.length, exercise.id);
  const picked = reply?.answer ?? solution ?? null;
  useTutorWork(lessonId, exercise.id, { body: picked ? `(chose) ${picked}` : "", goals: null, error: reply && !reply.reply.solved ? "That is not what the statement says." : null });
  return (
    <>
      {(exercise.says || exercise.given) && <Claim exercise={exercise} />}
      <div data-read={exercise.id} className={card}>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <pre className="lean overflow-x-auto rounded-xl border border-line bg-raised/60 px-3 py-2 text-sm text-fg">{`example ${exercise.statement}`}</pre>
          <p className="text-sm text-fg-2">Which sentence says what this claims?</p>
          <div className="flex flex-col gap-2" role="group" aria-label="Sentences to choose from">
            {order.map((i) => {
              const option = exercise.options[i];
              const chosen = picked === option;
              const right = chosen && (reply ? reply.reply.solved : !!solution);
              return (
                <button
                  key={i}
                  type="button"
                  data-option={i}
                  aria-pressed={chosen}
                  disabled={busy}
                  onClick={() => void send(option)}
                  className={cx("rounded-xl border-2 px-3 py-2 text-left text-fg transition-colors hover:border-accent", chosen ? (right ? "border-good" : "border-bad") : "border-line")}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
            {trouble && <Notice tone="warn">{trouble}</Notice>}
            {reply && (
              <div data-verdict={reply.reply.solved ? "right" : "wrong"}>
                {reply.reply.solved ? <Closed><strong>Right.</strong> {exercise.why}</Closed> : <Notice tone="warn">Not quite: read it again, quantifier by quantifier. {exercise.why}</Notice>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Kind `match`: sentences and Lean statements, paired one to one. */
export function Match(props: ExerciseProps) {
  const { lessonId, exercise, solution } = props;
  const { english, lean } = exercise.pairs!;
  const { reply, busy, trouble, send } = useAnswer(props);
  const order = shuffled(lean.length, exercise.id);
  // For each sentence, the Lean line paired with it (its authored index), or null.
  const [pairs, setPairs] = useState<(number | null)[]>(() => (solution ? solution.split(",").map(Number) : english.map(() => null)));
  const answer = pairs.every((p) => p !== null) ? pairs.join(",") : null;
  const result = reply && reply.answer === answer ? reply.reply : null;
  useTutorWork(lessonId, exercise.id, { body: english.map((e, i) => `${e} ↔ ${pairs[i] === null ? "?" : lean[pairs[i]!]}`).join("\n"), goals: null, error: result && !result.solved ? "Not every pair is right." : null });

  const pick = (sentence: number, line: number | null) =>
    setPairs((ps) => ps.map((p, i) => (i === sentence ? line : p === line && line !== null ? null : p)));

  return (
    <>
      <Claim exercise={exercise} />
      <div data-match={exercise.id} className={card}>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          {english.map((sentence, i) => (
            <label key={i} className="grid items-center gap-2 sm:grid-cols-2">
              <span className="text-fg">{sentence}</span>
              <select
                data-pair={i}
                value={pairs[i] ?? ""}
                disabled={busy}
                onChange={(e) => pick(i, e.target.value === "" ? null : Number(e.target.value))}
                className={cx("lean rounded-md border-2 bg-panel px-2 py-1 text-sm text-fg outline-none focus:border-accent", result ? (result.solved ? "border-good" : "border-line-strong") : "border-line-strong")}
              >
                <option value="">Choose the Lean…</option>
                {order.map((j) => (
                  <option key={j} value={j}>
                    {lean[j]}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={busy || answer === null} onClick={() => answer && void send(answer)}>
              Check
            </Button>
          </div>
          <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
            {trouble && <Notice tone="warn">{trouble}</Notice>}
            {result && (
              <div data-verdict={result.solved ? "right" : "wrong"}>
                {result.solved ? (
                  <Closed>
                    <strong>All paired right.</strong>
                  </Closed>
                ) : (
                  <Notice tone="warn">{`${pairs.filter((p, i) => p === i).length} of ${english.length} pairs are right. Look again at the order of ∀ and ∃, and at which way each arrow points.`}</Notice>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
