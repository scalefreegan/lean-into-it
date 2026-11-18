import { useState } from "react";
import type { LevelStatus } from "../../shared/progress.ts";
import { ApiError } from "../api/client.ts";
import { useApp } from "../state.tsx";
import { Button } from "../ui.tsx";

// What a locked level needs before it opens, and the learner's own way in.
// Shown on the Path's level card and on a lesson page in a locked level.

/** "Opens when 2 more of Level 0's concepts are mastered (3 of 7 so far)." */
function lockText(s: LevelStatus): string {
  if (s.gate === null || s.need === 0) return "Opens when the level before it is open.";
  return `Opens when ${s.need} more of Level ${s.gate}’s concepts ${s.need === 1 ? "is" : "are"} mastered (${s.gateMastered} of ${s.gateTotal} so far).`;
}

export function LevelLock({ status }: { status: LevelStatus }) {
  const { openLevel } = useApp();
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  return (
    <div data-level-lock={status.level} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised px-4 py-3">
      <p className="text-sm text-fg-2">{lockText(status)}</p>
      <Button
        data-open-level={status.level}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setTrouble(null);
          openLevel(status.level).then(
            () => setBusy(false),
            (e: unknown) => {
              setBusy(false);
              setTrouble(e instanceof ApiError ? e.message : String(e));
            },
          );
        }}
      >
        Open anyway
      </Button>
      {trouble && <p className="w-full text-sm text-bad">{trouble}</p>}
    </div>
  );
}
