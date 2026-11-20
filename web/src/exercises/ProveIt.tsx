import { useCallback, useEffect, useRef, useState } from "react";
import { learnedMoves, onBoard, stepDown, type Ladder } from "../../shared/ladder.ts";
import { readLine } from "../../shared/moves.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { ProofBoard } from "../proof/ProofBoard.tsx";
import { TypedProof } from "../proof/TypedProof.tsx";
import { useApp } from "../state.tsx";
import { Claim } from "./Claim.tsx";
import type { ExerciseProps } from "./types.ts";

/** What stepping down from each rung gives, said on its button. */
const DOWN: Record<Ladder, string> = {
  1: "",
  2: "Only the moves for this proof",
  3: "Use the proof board",
  4: "Show me the moves",
};

/** What stepping back up to the exercise's own rung gives. */
const UP: Record<Ladder, string> = {
  1: "",
  2: "Every move learned so far",
  3: "Back to typing",
  4: "Back to typing alone",
};

/** Kind `prove`: the claim in words, the definitions it is about, and then
 *  the proof board or the editor, as the exercise's rung on the ladder says
 *  (web/shared/ladder.ts). The learner can step down a rung for this
 *  exercise, and back up to where it started; the rung goes with each check.
 *  The proof so far goes with them between the two board rungs (when every
 *  line is one the fewer moves write) and between the two editor rungs. */
export function ProveIt(props: ExerciseProps) {
  const { exercise, lessonId } = props;
  const { content } = useApp();
  const [rung, setRung] = useState<Ladder>(exercise.ladder);
  const level = content.lessons.find((l) => l.id === lessonId)?.level ?? 0;
  const learned = learnedMoves(content.levels, level, exercise.moves, exercise.forbid);
  const down = stepDown(rung, exercise.mode);
  // The board's lines, to carry to the other board rung.
  const lines = useRef<string[]>([]);
  const [resume, setResume] = useState<string[] | undefined>(undefined);
  const onLines = useCallback((l: string[]) => {
    lines.current = l;
  }, []);
  // After a step the button pressed may be gone: focus stays on the ladder's controls.
  const bar = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) bar.current?.focus();
  }, [rung]);

  function go(to: Ladder) {
    moved.current = true;
    if (onBoard(rung) && onBoard(to)) {
      const keep = to === 2 || lines.current.every((l) => exercise.moves.includes(readLine(l)?.move.id ?? ""));
      setResume(keep ? lines.current : undefined);
    } else setResume(undefined);
    setRung(to);
  }

  return (
    <>
      <Claim exercise={exercise} />
      <ErrorBoundary label={`exercise ${exercise.id}`}>
        {onBoard(rung) ? (
          <ProofBoard {...props} key={rung} ladder={rung} moves={rung === 1 ? exercise.moves : learned} onLines={onLines} {...(resume ? { resume } : {})} />
        ) : (
          // One editor for rungs 3 and 4, so showing or hiding the moves keeps the text.
          <TypedProof {...props} ladder={rung} {...(rung === 3 ? { palette: learned, paletteOpen: exercise.ladder === 4 } : {})} />
        )}
      </ErrorBoundary>
      {(down !== null || rung < exercise.ladder) && (
        <div ref={bar} tabIndex={-1} data-ladder={rung} aria-label="How much help the input gives" role="group" className="-mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-3 outline-none">
          {down !== null && (
            <button type="button" data-step-down className="text-accent underline-offset-2 hover:underline" onClick={() => go(down)}>
              {DOWN[rung]}
            </button>
          )}
          {rung < exercise.ladder && (
            <button type="button" data-step-up className="text-accent underline-offset-2 hover:underline" onClick={() => go(exercise.ladder)}>
              {UP[exercise.ladder]}
            </button>
          )}
        </div>
      )}
    </>
  );
}
