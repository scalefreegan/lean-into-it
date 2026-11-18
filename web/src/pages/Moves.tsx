import { useEffect } from "react";
import { MOVES } from "../../shared/moves.ts";
import { MASTERY_THRESHOLD, MIN_ATTEMPTS, masteryFor, tacticsOf } from "../../shared/progress.ts";
import { useApp } from "../state.tsx";
import { MasteryBar } from "../ui.tsx";

/** Moves typed in a proof and not on the board, so not in MOVES. */
const TYPED_ONLY: Record<string, string> = {
  calc: "Prove a chain of equations or inequalities one link at a time, each with its own reason.",
  have: "State a new fact in the middle of a proof, prove it, and add it to your facts.",
  "exact?": "Ask Lean to search the library for a fact that finishes the goal.",
};

// Every move the curriculum teaches, level by level, with how well the
// learner knows it (web/shared/progress.ts says how that is worked out).

export function Moves() {
  const { content, mastery, reloadProgress } = useApp();
  useEffect(() => void reloadProgress(), [reloadProgress]);
  const all = tacticsOf(content);
  const learned = all.filter((t) => masteryFor(mastery.tactics, t)?.mastered).length;
  const levelOf = (t: string) => content.levels.find((l) => l.moves.includes(t))!;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold text-fg">Moves</h1>
        <p className="mt-2 max-w-2xl text-lg text-fg-2">
          Every move the Path teaches. A proof Lean accepts counts for each move in it; a refused move counts against it. A move is learned at{" "}
          {Math.round(MASTERY_THRESHOLD * 100)}% over at least {MIN_ATTEMPTS} uses, with the latest counting most.
        </p>
        <p className="mt-3 text-sm text-fg-3" data-moves-learned>
          {learned} of {all.length} moves learned.
        </p>
      </header>
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line-strong bg-panel">
        {all.map((t) => {
          const m = masteryFor(mastery.tactics, t);
          const level = levelOf(t);
          return (
            <li key={t} data-move={t} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <code className="w-28 shrink-0 font-mono font-semibold text-fg">{t}</code>
              <span className="min-w-0 flex-1 text-sm text-fg-2">{Object.hasOwn(MOVES, t) ? MOVES[t].does : Object.hasOwn(TYPED_ONLY, t) ? TYPED_ONLY[t] : ""}</span>
              <span className="w-20 shrink-0 font-mono text-xs text-fg-3">Level {level.id}</span>
              <span className="w-32 shrink-0 text-right">
                {m ? (
                  <MasteryBar value={m.mastery} mastered={m.mastered} label={`${t} mastery`} />
                ) : (
                  <span className="text-xs text-fg-3">not used yet</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
