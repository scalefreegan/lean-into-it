import type { Exercise, Lesson as LessonType } from "../../shared/content.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { Markdown } from "../markdown.tsx";
import { ProofBoard } from "../proof/ProofBoard.tsx";
import { TypedProof } from "../proof/TypedProof.tsx";
import { href } from "../router.ts";
import { lessonProgress, useApp } from "../state.tsx";
import { Notice, Tick } from "../ui.tsx";

// A lesson: prose and exercises in the order the file gives them. Lean
// checks each exercise; a solved one is remembered (state.tsx markSolved,
// and the server has already stored it).

export function Lesson({ id }: { id: string }) {
  const { content, solved, markSolved } = useApp();
  const index = content.lessons.findIndex((l) => l.id === id);
  const lesson = content.lessons[index];
  if (!lesson) {
    return (
      <div className="mx-auto max-w-[1440px]">
        <Notice tone="warn">
          There is no lesson called “{id}”. <a className="font-semibold text-accent underline" href={href("home")}>Back to the Path</a>
        </Notice>
      </div>
    );
  }
  const next = content.lessons[index + 1];
  const progress = lessonProgress(lesson, solved);
  const level = content.levels.find((l) => l.id === lesson.level);
  const track = content.tracks.find((t) => t.id === lesson.track);

  return (
    <article className="mx-auto flex max-w-[1440px] flex-col gap-6" data-lesson-page={lesson.id}>
      <header>
        <p className="text-sm text-fg-3">
          <a className="text-accent underline-offset-2 hover:underline" href={href("home")}>
            The Path
          </a>{" "}
          · Level {lesson.level}
          {level ? `: ${level.title}` : ""} · {track?.title ?? lesson.track}
        </p>
        <h1 className="mt-1 text-4xl font-semibold text-fg">{lesson.title}</h1>
        <p className="mt-2 text-lg text-fg-2">{lesson.summary}</p>
      </header>

      {lesson.blocks.map((block, i) => {
        if (block.type === "prose") {
          // Running text keeps a readable line length; the proofs below it use the full width.
          return (
            <div key={i} className="max-w-3xl">
              <Markdown source={block.markdown} />
            </div>
          );
        }
        const exercise = lesson.exercises.find((e) => e.id === block.id);
        if (!exercise) return null;
        return (
          <ExerciseBlock
            key={block.id}
            lesson={lesson}
            exercise={exercise}
            number={lesson.exercises.indexOf(exercise) + 1}
            solution={solved[lesson.id]?.[exercise.id]?.solution}
            onSolved={(body) => markSolved(lesson.id, exercise.id, body)}
          />
        );
      })}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="flex items-center gap-2 text-fg-2" data-lesson-progress>
          {progress.complete && <Tick className="text-good" />}
          {progress.complete ? "Lesson complete." : `${progress.done} of ${progress.total} proofs done.`}
        </p>
        <a className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover" href={next ? href("lesson", next.id) : href("home")}>
          {next ? `Next: ${next.title}` : "Back to the Path"}
        </a>
      </footer>
    </article>
  );
}

function ExerciseBlock({ lesson, exercise, number, solution, onSolved }: { lesson: LessonType; exercise: Exercise; number: number; solution?: string; onSolved: (body: string) => void }) {
  const props = { lessonId: lesson.id, exercise, onSolved, ...(solution !== undefined ? { solution } : {}) };
  return (
    <section data-exercise={exercise.id} className="flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
          Prove it · {number}
          {solution !== undefined && <Tick className="h-4 w-4 text-good" />}
        </div>
        <h3 className="text-xl font-semibold text-fg">{exercise.title}</h3>
        <p className="mt-1 font-display text-lg italic text-fg-2">{exercise.says}</p>
      </div>
      <ErrorBoundary label={`exercise ${exercise.id}`}>{exercise.mode === "board" ? <ProofBoard {...props} /> : <TypedProof {...props} />}</ErrorBoundary>
    </section>
  );
}
