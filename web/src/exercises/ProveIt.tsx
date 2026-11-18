import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { ProofBoard } from "../proof/ProofBoard.tsx";
import { TypedProof } from "../proof/TypedProof.tsx";
import { Claim } from "./Claim.tsx";
import type { ExerciseProps } from "./types.ts";

/** Kind `prove`: the claim in words, the definitions it is about, and then
 *  the proof board or the editor, as the exercise's `mode` says. */
export function ProveIt(props: ExerciseProps) {
  const { exercise } = props;
  return (
    <>
      <Claim exercise={exercise} />
      <ErrorBoundary label={`exercise ${exercise.id}`}>{exercise.mode === "board" ? <ProofBoard {...props} /> : <TypedProof {...props} />}</ErrorBoundary>
    </>
  );
}
