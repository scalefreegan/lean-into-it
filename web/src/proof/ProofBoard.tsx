import { useCallback, useEffect, useRef, useState } from "react";
import type { Exercise } from "../../shared/content.ts";
import { explain } from "../../shared/explain.ts";
import { namesIn, type Goal } from "../../shared/goals.ts";
import { MOVES, moveLine, type Move } from "../../shared/moves.ts";
import { ApiError, check } from "../api/client.ts";
import { Button, cx, Notice } from "../ui.tsx";
import { Closed, GoalView, Refusal } from "./GoalCards.tsx";

// The proof board: a proof made by clicking. The cards are Lean's own goal
// state; a move is one tactic; every accepted move adds its line to "Lean
// written so far". Lean checks each move as it is made, and a move Lean
// refuses is not added.

/** The board after some lines: what Lean reports at the end of them. */
interface Step {
  lines: string[];
  goals: Goal[];
}

interface Props {
  lessonId: string;
  exercise: Exercise;
  /** The proof that solved it before, to show the finished board. */
  solution?: string;
  onSolved: (body: string) => void;
}

export function ProofBoard({ lessonId, exercise, solution, onSolved }: Props) {
  // history[history.length - 1] is the board now; undo pops, so it never asks Lean.
  const [history, setHistory] = useState<Step[]>([]);
  const [solved, setSolved] = useState(false);
  const [pending, setPending] = useState<Move | null>(null);
  const [busy, setBusy] = useState(true);
  const [refusal, setRefusal] = useState<{ line: string; raw: string } | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  // Bumped whenever the board is replaced; a reply to an older request is dropped.
  const seq = useRef(0);

  const load = useCallback(
    async (lines: string[]) => {
      const mine = ++seq.current;
      setBusy(true);
      setTrouble(null);
      setRefusal(null);
      setPending(null);
      try {
        let reply = await check({ lessonId, exerciseId: exercise.id, body: lines.join("\n") });
        if (mine !== seq.current) return;
        if (lines.length && !reply.solved) {
          // A stored solution Lean no longer accepts (the exercise changed): start clean.
          lines = [];
          reply = await check({ lessonId, exerciseId: exercise.id, body: "" });
          if (mine !== seq.current) return;
        }
        setHistory([{ lines, goals: reply.goals }]);
        setSolved(reply.solved);
      } catch (e) {
        if (mine === seq.current) setTrouble(e instanceof ApiError ? e.message : String(e));
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    },
    [lessonId, exercise.id],
  );

  // The stored solution is read once, when the board opens: solving the
  // exercise changes the prop, and must not reload the board.
  const opening = useRef(solution);
  useEffect(() => {
    const counter = seq;
    void load(opening.current ? opening.current.split("\n").filter((l) => l.trim()) : []);
    return () => {
      counter.current++;
    };
  }, [load]);

  const now = history[history.length - 1];
  const before = history.length > 1 ? history[history.length - 2] : null;

  // `busy` is state, so two clicks in one frame both see it false; this is
  // set at once, and keeps a double click from playing a move twice.
  const playing = useRef(false);

  async function play(line: string) {
    if (!now || busy || solved || playing.current) return;
    playing.current = true;
    const mine = ++seq.current;
    const lines = [...now.lines, line];
    setBusy(true);
    setRefusal(null);
    setTrouble(null);
    setPending(null);
    try {
      const reply = await check({ lessonId, exerciseId: exercise.id, body: lines.join("\n"), record: "rejected" });
      if (mine !== seq.current) return;
      if (reply.error) {
        setRefusal({ line, raw: reply.error.message });
        setShake((n) => n + 1);
        return;
      }
      setHistory((h) => [...h, { lines, goals: reply.goals }]);
      if (reply.solved) {
        setSolved(true);
        onSolved(lines.join("\n"));
      }
    } catch (e) {
      if (mine === seq.current) setTrouble(e instanceof ApiError ? e.message : String(e));
    } finally {
      playing.current = false;
      if (mine === seq.current) setBusy(false);
    }
  }

  function pickMove(move: Move) {
    if (!now || busy) return;
    setRefusal(null);
    if (move.needs === "fact") {
      setPending((p) => (p?.id === move.id ? null : move));
      return;
    }
    void play(moveLine(move, now.goals[0] ?? { hypotheses: [], target: "" }));
  }

  function pickFact(name: string) {
    if (!now || !pending) return;
    void play(moveLine(pending, now.goals[0] ?? { hypotheses: [], target: "" }, name));
  }

  function undo() {
    if (history.length < 2 || busy) return;
    seq.current++;
    setHistory((h) => h.slice(0, -1));
    setSolved(false);
    setRefusal(null);
    setPending(null);
  }

  function reset() {
    if (busy) return;
    seq.current++;
    setHistory((h) => h.slice(0, 1));
    setSolved(false);
    setRefusal(null);
    setPending(null);
    // A board opened on a stored solution has that as its first step.
    if (history[0]?.lines.length) void load([]);
  }

  const moves = exercise.moves.map((id) => MOVES[id]).filter(Boolean);
  const known = before && now && now.goals[0] && before.goals[0] ? new Set(namesIn(before.goals[0])) : undefined;

  return (
    <div data-board={exercise.id} className="overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-sm">
      <div key={shake} className={cx("p-4 sm:p-5", shake > 0 && refusal && "refused")}>
        {trouble ? (
          <Notice tone="warn">{trouble}</Notice>
        ) : !now ? (
          <div className="py-8 text-center text-sm text-fg-3">Waking Lean up… the first proof of a session takes a few seconds.</div>
        ) : solved ? (
          <Closed>
            <strong>No goals left.</strong> Lean accepts this proof.
          </Closed>
        ) : (
          <GoalView goals={now.goals} picking={!!pending} {...(pending ? { onPickFact: pickFact } : {})} {...(known ? { known } : {})} />
        )}
      </div>

      {now && !solved && !trouble && (
        <div className="border-t border-line bg-raised/50 px-4 py-3 sm:px-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">Moves</div>
          <div className="flex flex-wrap gap-2">
            {moves.map((move) => (
              <button
                key={move.id}
                type="button"
                data-move={move.id}
                disabled={busy}
                aria-pressed={pending?.id === move.id}
                onClick={() => pickMove(move)}
                title={move.does}
                className={cx(
                  "rounded-full border-2 px-4 py-1.5 font-mono text-sm font-semibold transition-colors disabled:opacity-50",
                  pending?.id === move.id ? "border-accent bg-accent text-accent-ink" : "border-accent bg-panel text-accent hover:bg-accent-soft",
                )}
              >
                {move.label}
              </button>
            ))}
          </div>
          <p className="mt-2 min-h-5 text-sm text-fg-2">{pending ? (pending.prompt ?? "Click a fact.") : busy ? "Lean is checking…" : "Pick a move. Hover over one to see what it does."}</p>
          {refusal && <Refusal className="mt-2" plain={`“${refusal.line}” does not work here. ${explain(refusal.raw) ?? ""}`.trim()} raw={refusal.raw} />}
        </div>
      )}

      {now && (
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-3">Lean written so far</div>
            <div className="flex gap-2">
              <Button onClick={undo} disabled={busy || history.length < 2} className="px-2.5 py-1 text-xs">
                Undo
              </Button>
              <Button onClick={reset} disabled={busy || now.lines.length === 0} className="px-2.5 py-1 text-xs">
                Start over
              </Button>
            </div>
          </div>
          <pre data-lean-so-far className="lean text-sm leading-6 text-fg-2">
            <span className="text-fg-3">example {exercise.statement} := by</span>
            {now.lines.map((l, i) => (
              <span key={i} className={cx("block text-fg", i === now.lines.length - 1 && history.length > 1 && "arrive")}>
                {"  "}
                {l}
              </span>
            ))}
            {!now.lines.length && <span className="block text-fg-3">{"  "}…</span>}
          </pre>
        </div>
      )}
    </div>
  );
}
