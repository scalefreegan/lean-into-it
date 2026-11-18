import { MOVES } from "../../shared/moves.ts";
import { list } from "./params.ts";
import type { WidgetProps } from "./types.ts";

/** `move-list`: moves from the board with what each does, in the board's
 *  own words (web/shared/moves.ts), so the two never disagree. */
export function MoveList({ params }: WidgetProps) {
  const moves = list(params, "moves", []).flatMap((id) => (MOVES[id] ? [MOVES[id]] : []));
  return (
    <dl data-widget="move-list" className="grid max-w-4xl gap-x-4 gap-y-3 rounded-2xl border border-line-strong bg-panel p-4 shadow-sm sm:grid-cols-[max-content_1fr] sm:p-5">
      {moves.map((move) => (
        <div key={move.id} data-move-card={move.id} className="contents">
          <dt>
            <span className="inline-block rounded-full border-2 border-accent bg-panel px-4 py-1.5 font-mono text-sm font-semibold text-accent">{move.label}</span>
          </dt>
          <dd className="self-center text-base text-fg-2">{move.does}</dd>
        </div>
      ))}
    </dl>
  );
}
