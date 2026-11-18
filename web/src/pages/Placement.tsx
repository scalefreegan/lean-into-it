import { useMemo, useRef, useState } from "react";
import type { Exercise } from "../../shared/content.ts";
import { PLACEMENT_PASS, placementItems, placementLevels, placementVerdict } from "../../shared/placement.ts";
import { EXERCISES } from "../../shared/registry.ts";
import { ApiError, tutorLadder } from "../api/client.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { EXERCISE_COMPONENTS } from "../exercises/registry.ts";
import { href } from "../router.ts";
import { useApp } from "../state.tsx";
import { useTouch } from "../tutor/store.ts";
import { Button, Notice } from "../ui.tsx";

// The placement check (#/placement, web/shared/placement.ts): a few
// exercises from each level in order, one at a time. Solve it and it counts;
// "I don't know this yet" is a miss, and so is a solve with the Tutor's
// line. A level ends as soon as it is settled. Pass one and the next is
// offered; the first level not passed is where the path starts. Every
// answer is checked by Lean and recorded like any other attempt.

type Stage = { at: "intro" } | { at: "asking"; level: number } | { at: "passed"; level: number } | { at: "saving"; placedAt: number } | { at: "failed"; placedAt: number; error: string } | { at: "placed"; placedAt: number };

export function Placement() {
  const { content, solved, markSolved, place } = useApp();
  const levels = useMemo(() => placementLevels(content), [content]);
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  // The solved map as the check began: solving a question must not reshuffle the level's questions.
  const [startSolved] = useState(solved);
  const [stage, setStage] = useState<Stage>({ at: "intro" });
  const [answers, setAnswers] = useState<boolean[]>([]);
  const saving = useRef(false);
  const title = (id: number) => content.levels.find((l) => l.id === id)?.title ?? "";
  const asking = stage.at === "asking" ? stage.level : null;
  const items = useMemo(() => (asking === null ? [] : placementItems(content, asking, seed + asking, startSolved)), [content, asking, seed, startSolved]);
  const nextLevel = (level: number) => levels[levels.indexOf(level) + 1];
  /** The level a placement starts the path at when `level` is the first not passed. */
  const pastLast = levels.length ? levels[levels.length - 1] + 1 : 0;

  const finish = async (placedAt: number) => {
    if (saving.current) return;
    saving.current = true;
    setStage({ at: "saving", placedAt });
    try {
      await place(placedAt);
      setStage({ at: "placed", placedAt });
    } catch (e) {
      setStage({ at: "failed", placedAt, error: e instanceof ApiError ? e.message : String(e) });
    } finally {
      saving.current = false;
    }
  };

  const start = (level: number) => {
    setAnswers([]);
    setStage({ at: "asking", level });
    window.scrollTo(0, 0);
  };

  const answer = (right: boolean) => {
    if (asking === null) return;
    const all = [...answers, right];
    setAnswers(all);
    const verdict = placementVerdict(
      all.filter(Boolean).length,
      all.filter((a) => !a).length,
      items.length,
    );
    if (verdict === "failed") void finish(asking);
    else if (verdict === "passed") {
      if (nextLevel(asking) === undefined) void finish(pastLast);
      else setStage({ at: "passed", level: asking });
    }
  };

  const current = asking !== null ? items[answers.length] : undefined;
  const lesson = current && content.lessons.find((l) => l.id === current.lessonId);
  const exercise = current && lesson?.exercises.find((e) => e.id === current.exerciseId);

  return (
    <div className="mx-auto flex max-w-[2400px] flex-col gap-6" data-placement-page data-stage={stage.at}>
      <header>
        <h1 className="text-4xl font-semibold text-fg">Placement check</h1>
        <p className="mt-2 max-w-2xl text-lg text-fg-2">Skip what you already know.</p>
      </header>

      {stage.at === "intro" && (
        <section className="max-w-2xl rounded-2xl border border-line-strong bg-panel p-5">
          <p className="text-fg-2">
            A few proofs from each level, one at a time, starting with Level {levels[0]}. Solve {Math.round(PLACEMENT_PASS * 100)}% of a level’s and you skip it; the first level you do not pass is where your
            path starts. Lean checks every answer, and the ideas you skip come back in Review over the next two weeks. “I don’t know this yet” is always a fine answer.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" data-placement-start onClick={() => start(levels[0])} disabled={!levels.length}>
              Start with Level {levels[0]} · {title(levels[0])}
            </Button>
            <a className="self-center text-sm font-semibold text-accent underline-offset-2 hover:underline" href={href("home")}>
              Not now
            </a>
          </div>
        </section>
      )}

      {stage.at === "asking" && current && lesson && exercise && (
        <PlacementQuestion
          key={`${current.lessonId}/${current.exerciseId}`}
          level={stage.level}
          levelTitle={title(stage.level)}
          number={answers.length + 1}
          of={items.length}
          lesson={lesson}
          exercise={exercise}
          onSolved={(body) => {
            markSolved(lesson.id, exercise.id, body);
            // A solve with the Tutor's line (rung 3 today) is a miss here, as it is assisted everywhere.
            tutorLadder(lesson.id, exercise.id).then(
              (r) => answer(r.rung < 3),
              () => answer(true),
            );
          }}
          onSkip={() => answer(false)}
        />
      )}

      {stage.at === "passed" && (
        <section className="max-w-2xl rounded-2xl border border-good-line bg-good-soft p-5" data-placement-passed={stage.level}>
          <p className="text-2xl font-semibold text-fg">Level {stage.level} passed.</p>
          <p className="mt-1 text-fg-2">Try the next level, or stop here and start at Level {nextLevel(stage.level)}.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" data-placement-next onClick={() => start(nextLevel(stage.level))}>
              Try Level {nextLevel(stage.level)} · {title(nextLevel(stage.level))}
            </Button>
            <Button data-placement-stop onClick={() => void finish(nextLevel(stage.level))}>
              Start me at Level {nextLevel(stage.level)}
            </Button>
          </div>
        </section>
      )}

      {stage.at === "saving" && (
        <p role="status" className="text-fg-3">
          Saving your placement…
        </p>
      )}

      {stage.at === "failed" && (
        <section className="max-w-2xl">
          <Notice tone="bad">
            <strong>Your placement is not saved yet.</strong> {stage.error}
          </Notice>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => void finish(stage.placedAt)}>
              Try saving again
            </Button>
            <a className="self-center text-sm font-semibold text-accent underline-offset-2 hover:underline" href={href("home")}>
              Leave without placing
            </a>
          </div>
        </section>
      )}

      {stage.at === "placed" && (
        <section className="max-w-2xl rounded-2xl border border-line-strong bg-panel p-5" data-placed-at={stage.placedAt}>
          <p className="text-2xl font-semibold text-fg">
            {stage.placedAt <= levels[0]
              ? `You start at the beginning, Level ${levels[0]}.`
              : stage.placedAt >= pastLast
                ? "You passed every level there is so far."
                : `You start at Level ${stage.placedAt} · ${title(stage.placedAt)}.`}
          </p>
          <p className="mt-1 text-fg-2">
            {stage.placedAt <= levels[0] ? "Nothing is lost: the check can be taken again from the Path." : "The levels below are open too, and their ideas come back in Review over the next two weeks."}
          </p>
          <a
            className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
            href={href("home")}
          >
            Go to the Path
          </a>
        </section>
      )}
    </div>
  );
}

function PlacementQuestion({
  level,
  levelTitle,
  number,
  of,
  lesson,
  exercise,
  onSolved,
  onSkip,
}: {
  level: number;
  levelTitle: string;
  number: number;
  of: number;
  lesson: { id: string; title: string };
  exercise: Exercise;
  onSolved: (body: string) => void;
  onSkip: () => void;
}) {
  const Kind = EXERCISE_COMPONENTS[exercise.kind];
  const touch = useTouch(lesson.id, exercise.id);
  return (
    <section data-exercise={exercise.id} data-placement-question={number} className="flex flex-col gap-3" {...touch}>
      <div>
        <p className="text-sm text-fg-3" data-placement-progress>
          Level {level} · {levelTitle} · question {number} of at most {of}
        </p>
        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent">{EXERCISES[exercise.kind].label}</div>
        <h3 className="text-xl font-semibold text-fg">{exercise.title}</h3>
        <p className="text-sm text-fg-3">From {lesson.title}</p>
      </div>
      <ErrorBoundary label={`exercise ${exercise.id}`}>
        <Kind lessonId={lesson.id} exercise={exercise} onSolved={onSolved} />
      </ErrorBoundary>
      <div>
        <Button data-placement-skip onClick={onSkip}>
          I don’t know this yet
        </Button>
      </div>
    </section>
  );
}
