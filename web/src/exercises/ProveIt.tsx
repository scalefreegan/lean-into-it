import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { ProofBoard } from "../proof/ProofBoard.tsx";
import { TypedProof } from "../proof/TypedProof.tsx";
import type { ExerciseProps } from "./types.ts";

/** Kind `prove`: the claim in words, the definitions it is about, and then
 *  the proof board or the editor, as the exercise's `mode` says. */
export function ProveIt(props: ExerciseProps) {
  const { exercise } = props;
  return (
    <>
      {/* The lesson page spaces its parts by 0.75rem; the claim sits closer to the title above it. */}
      <div className="-mt-2">
        <p className="font-display text-lg italic text-fg-2">{exercise.says}</p>
        {exercise.given && (
          <details className="mt-2" data-given>
            <summary className="cursor-pointer text-sm font-semibold text-fg-3">The definitions this is about</summary>
            <pre className="lean mt-2 overflow-x-auto rounded-xl border border-line bg-raised px-4 py-3 text-sm leading-6 text-fg-2">{exercise.given}</pre>
          </details>
        )}
      </div>
      <ErrorBoundary label={`exercise ${exercise.id}`}>{exercise.mode === "board" ? <ProofBoard {...props} /> : <TypedProof {...props} />}</ErrorBoundary>
    </>
  );
}
