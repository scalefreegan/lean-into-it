import { parseState } from "../../shared/goals.ts";
import { GoalView } from "../proof/GoalCards.tsx";
import { str } from "./params.ts";
import type { WidgetProps } from "./types.ts";

/** `proof-state`: a state written in the lesson, drawn with the proof
 *  board's own cards, so the prose and the board show the same picture. */
export function ProofState({ params }: WidgetProps) {
  const goals = parseState(str(params, "state", ""));
  const caption = str(params, "caption", "");
  return (
    <figure data-widget="proof-state" className="max-w-3xl rounded-2xl border border-line-strong bg-panel p-4 shadow-sm sm:p-5">
      <GoalView goals={goals} />
      {caption && <figcaption className="mt-3 border-t border-line pt-3 text-sm text-fg-3">{caption}</figcaption>}
    </figure>
  );
}
