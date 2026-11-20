import { useEffect, useMemo, useState } from "react";
import type { Goal } from "../../shared/goals.ts";
import { proofLines, readSteps, unsaid } from "../../shared/paired.ts";
import { check } from "../api/client.ts";
import { GoalView } from "../proof/GoalCards.tsx";
import { useApp } from "../state.tsx";
import { Button, cx, Notice } from "../ui.tsx";
import { str } from "./params.ts";
import type { WidgetProps } from "./types.ts";

// `informal-formal`: a textbook proof beside the Lean proof of one of the
// lesson's exercises (web/shared/paired.ts). Selecting a sentence lights its
// lines; selecting a line lights its sentences and asks Lean for the state
// after it. That ask is a check without `record`, so it is not an attempt.

type Pick = { kind: "step"; i: number } | { kind: "line"; n: number } | null;

export function InformalFormal({ params, lessonId }: WidgetProps) {
  const { content, solved } = useApp();
  const lessonOf = str(params, "lesson", "") || lessonId || "";
  const lesson = content.lessons.find((l) => l.id === lessonOf);
  const exercise = lesson?.exercises.find((e) => e.id === params.exercise);
  const lines = useMemo(() => (exercise ? proofLines(exercise.solution) : []), [exercise]);
  const { steps } = useMemo(() => readSteps(params.steps, lines.length), [params.steps, lines.length]);
  const left = useMemo(() => new Set(unsaid(steps, lines.length)), [steps, lines.length]);
  const caption = str(params, "caption", "");
  // In its own lesson the pairing would give the exercise away: it waits until that is solved, or asked for.
  const own = !params.lesson;
  const [shown, setShown] = useState(!own);
  const done = !!(lesson && exercise && solved[lesson.id]?.[exercise.id]);
  const [pick, setPick] = useState<Pick>(null);
  const [hover, setHover] = useState<Pick>(null);
  // Lean's reply for a line; while it is for another line than the one selected, Lean is being asked.
  const [state, setState] = useState<{ n: number; goals: Goal[] | null; error: string | null } | null>(null);

  const selectedLine = pick?.kind === "line" ? pick.n : null;
  useEffect(() => {
    if (selectedLine === null || !lesson || !exercise) return;
    const ctrl = new AbortController();
    const text = lines[selectedLine - 1];
    check({ lessonId: lesson.id, exerciseId: exercise.id, body: exercise.solution, cursor: { line: selectedLine - 1, character: text.length } }, ctrl.signal)
      .then((r) => setState({ n: selectedLine, goals: r.cursorGoals ?? [], error: null }))
      .catch((e: Error) => !ctrl.signal.aborted && setState({ n: selectedLine, goals: null, error: e.message }));
    return () => ctrl.abort();
  }, [selectedLine, lesson, exercise, lines]);

  if (!lesson || !exercise) return <Notice tone="warn">{`This paired proof cannot be drawn: no exercise "${String(params.exercise)}" in lesson "${lessonOf}".`}</Notice>;
  if (own && !shown && !done)
    return (
      <figure data-widget="informal-formal" className="max-w-3xl rounded-2xl border border-line-strong bg-panel p-4 text-sm text-fg-2 shadow-sm sm:p-5">
        <p>The same proof in words beside its Lean, once you have solved “{exercise.title}”.</p>
        <Button className="mt-3" onClick={() => setShown(true)}>
          Show it now
        </Button>
      </figure>
    );

  const lit = hover ?? pick;
  const stepLit = (i: number) => (lit?.kind === "step" ? lit.i === i : lit?.kind === "line" ? steps[i].lines.includes(lit.n) : false);
  const lineLit = (n: number) => (lit?.kind === "line" ? lit.n === n : lit?.kind === "step" ? steps[lit.i].lines.includes(n) : false);
  const toggle = (p: Exclude<Pick, null>) => setPick((cur) => (cur && cur.kind === p.kind && (cur.kind === "step" ? cur.i === (p as { i: number }).i : cur.n === (p as { n: number }).n) ? null : p));

  return (
    <figure data-widget="informal-formal" className="max-w-4xl rounded-2xl border border-line-strong bg-panel p-4 shadow-sm sm:p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">In words</div>
          <ol className="flex flex-col gap-1">
            {steps.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  data-step={i}
                  aria-pressed={pick?.kind === "step" && pick.i === i}
                  onClick={() => toggle({ kind: "step", i })}
                  onMouseEnter={() => setHover({ kind: "step", i })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover({ kind: "step", i })}
                  onBlur={() => setHover(null)}
                  className={cx("w-full rounded-lg border-2 px-3 py-1.5 text-left text-sm", stepLit(i) ? "border-accent bg-accent-soft text-fg" : "border-transparent text-fg-2 hover:bg-raised")}
                >
                  {s.say}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">In Lean</div>
          <div className="lean overflow-x-auto rounded-lg border border-line bg-ground p-2 text-[13px]">
            <div className="whitespace-pre px-2 py-0.5 text-fg-3">{`example ${exercise.statement} := by`}</div>
            {lines.map((text, k) => {
              const n = k + 1;
              return (
                <button
                  key={n}
                  type="button"
                  data-line={n}
                  aria-pressed={selectedLine === n}
                  aria-label={`Line ${n}: ${text.trim()}${left.has(n) ? ". No sentence says this one." : ""} Press for the state after it.`}
                  onClick={() => toggle({ kind: "line", n })}
                  onMouseEnter={() => setHover({ kind: "line", n })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover({ kind: "line", n })}
                  onBlur={() => setHover(null)}
                  className={cx("flex w-full gap-3 rounded-md px-2 py-0.5 text-left", lineLit(n) ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-raised", selectedLine === n && "ring-2 ring-accent")}
                >
                  <span className="w-4 shrink-0 text-right text-fg-3">{n}</span>
                  <span className="whitespace-pre">{`  ${text}`}</span>
                  {left.has(n) && (
                    <span className="ml-auto shrink-0 font-sans text-xs text-fg-3" data-unsaid>
                      unsaid
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3" aria-live="polite">
            {selectedLine === null ? (
              <p className="text-sm text-fg-3">Select a line of Lean to see the state after it.</p>
            ) : state?.n !== selectedLine ? (
              <p className="text-sm text-fg-3">Asking Lean…</p>
            ) : state.error ? (
              <Notice tone="warn">{`Lean could not show the state: ${state.error}`}</Notice>
            ) : state.goals === null ? null : (
              <div data-state-after={state.n}>
                <div className="mb-1 text-xs text-fg-3">After line {state.n}</div>
                <GoalView goals={state.goals} />
              </div>
            )}
          </div>
        </div>
      </div>
      {(caption || left.size > 0) && (
        <figcaption className="mt-3 text-sm text-fg-2">
          {caption}
          {left.size > 0 && `${caption ? " " : ""}A line marked unsaid is one Lean needed and the words did not mention.`}
        </figcaption>
      )}
    </figure>
  );
}
