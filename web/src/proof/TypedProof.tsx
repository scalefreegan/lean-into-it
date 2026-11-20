import { useEffect, useId, useRef, useState } from "react";
import type { Exercise } from "../../shared/content.ts";
import { explain, LEFT_FALSE, leftFalse as isLeftFalse, suggestion } from "../../shared/explain.ts";
import { stillOpenGoals, type Goal } from "../../shared/goals.ts";
import { insertLine } from "../../shared/ladder.ts";
import { MOVES, moveLine, type Move } from "../../shared/moves.ts";
import type { Position } from "../../shared/proof.ts";
import type { CheckReply } from "../../shared/wire.ts";
import { ApiError, check } from "../api/client.ts";
import { Button, Notice } from "../ui.tsx";
import { Closed, GoalView, Refusal } from "./GoalCards.tsx";
import { ProofMap } from "../widgets/ProofMap.tsx";
import { LeanEditor, SymbolHelp, type EditorWrite } from "./LeanEditor.tsx";
import { useLive } from "./useLive.ts";
import { useTutorWork } from "../tutor/store.ts";

// A proof typed as Lean. The statement is fixed; the learner writes the
// tactic lines. The panel beside the editor shows the goal state at the
// caret, as cards, and refreshes a moment after each pause in typing.

interface Props {
  lessonId: string;
  exercise: Exercise;
  solution?: string;
  onSolved: (body: string) => void;
  /** The answer sent for these proof lines, when it is more than the lines
   *  (a true-or-false answer names its side first). Default: the lines. */
  encode?: (body: string) => string;
  /** The line above the editor. Default: `example <statement> := by`. */
  header?: string;
  /** Kind `prove`: the ladder's rung (3 or 4), sent with each check that is an attempt. */
  ladder?: number;
  /** Rung 3: the moves behind "Show moves"; a click writes its line at the caret. */
  palette?: string[];
  /** Start with the moves shown (the learner stepped down to them). */
  paletteOpen?: boolean;
}

/** The line a palette click writes: the board's own line (`constructor`,
 *  `intro h`, `rw [?]`, `obtain ⟨x, hx⟩ := ?`), with `?` where the move needs
 *  something only the learner can say, and the index of that `?` (-1: none). */
function paletteLine(move: Move, goal: Goal, settled: boolean): { line: string; hole: number } {
  // A fresh name is chosen from the goals at the caret: only once Lean has answered for this text.
  if (move.needs === "name" && !settled) return { line: `${move.label} `, hole: -1 };
  if (move.needs === "none" || move.needs === "name") return { line: moveLine(move, goal), hole: -1 };
  const line = moveLine(move, goal, "?");
  return { line, hole: line.indexOf("?", move.label.length) };
}

/** Rung 3's moves, behind "Show moves". Its own state, so the editor beside
 *  it keeps its text when the moves are shown or hidden. */
function Palette({ moves, open, write }: { moves: string[]; open: boolean; write: (move: Move) => void }) {
  const [shown, setShown] = useState(open);
  const id = useId();
  return (
    <div data-palette className="flex flex-col gap-2">
      <button type="button" aria-expanded={shown} aria-controls={id} onClick={() => setShown((s) => !s)} className="self-start text-sm font-semibold text-accent underline-offset-2 hover:underline">
        {shown ? "Hide moves" : "Show moves"}
      </button>
      {shown && (
        <div id={id} className="flex flex-wrap gap-2">
          {moves
            .map((m) => MOVES[m])
            .filter(Boolean)
            .map((move) => (
              <button
                key={move.id}
                type="button"
                data-move={move.id}
                title={move.does}
                aria-label={`${move.label}: write its line at the caret`}
                onClick={() => write(move)}
                className="rounded-full border-2 border-accent bg-panel px-3 py-1 font-mono text-sm font-semibold text-accent hover:bg-accent-soft"
              >
                {move.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function TypedProof({ lessonId, exercise, solution, onSolved, encode = (b) => b, header, ladder, palette, paletteOpen = false }: Props) {
  const edit = useRef<EditorWrite | null>(null);
  const [body, setBody] = useState(solution ?? "");
  const [caret, setCaret] = useState<Position>({ line: 0, character: 0 });
  const [submitted, setSubmitted] = useState<{ body: string; reply: CheckReply } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const told = useRef(false);

  // Re-checking the stored solution the exercise opened with is not an attempt.
  const opening = useRef(solution);
  // The whole answer is in the key: when what surrounds the lines changes
  // (a counterexample's values), the reply to the old answer is dropped.
  const answer = encode(body);
  const live = useLive({ body, caret, answer }, (k, signal) =>
    check({ lessonId, exerciseId: exercise.id, body: k.answer, cursor: k.caret, ...(exercise.kind === "prove" ? { map: true } : {}), ...(k.body === opening.current ? {} : { record: "live" as const, ...(ladder ? { ladder } : {}) }) }, signal),
  );
  const reply = live.reply;

  // Lean accepting the proof is the finish line, whether or not Check was pressed.
  useEffect(() => {
    if (reply?.solved && !live.checking && !told.current) {
      told.current = true;
      onSolved(answer);
    }
  }, [reply, live.checking, answer, onSolved]);

  async function submit() {
    setSubmitting(true);
    setTrouble(null);
    try {
      const r = await check({ lessonId, exerciseId: exercise.id, body: answer, record: "submitted", ...(ladder ? { ladder } : {}) });
      setSubmitted({ body: answer, reply: r });
      if (r.solved && !told.current) {
        told.current = true;
        onSolved(answer);
      }
    } catch (e) {
      setTrouble(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const solved = !!reply?.solved && !live.checking;
  // Where a line is wrong, Lean may also report the goal that line left
  // open ("unsolved goals"). Beside the real error it would read "every line
  // is fine so far", so it is shown only when nothing else is wrong.
  const errors = (reply?.diagnostics ?? []).filter((d) => d.severity === "error" && d.line !== null && !(reply?.error && /^unsolved goals/.test(d.message)));
  // What `exact?` found, where the exercise allows searching.
  const found = live.checking || exercise.forbid.includes("exact?") ? [] : (reply?.diagnostics ?? []).flatMap((d) => (d.severity === "info" ? [suggestion(d.message)] : [])).filter((x): x is string => x !== null);
  const verdict = submitted && submitted.body === answer ? submitted.reply : null;
  const goals = reply ? (reply.cursorGoals ?? reply.goals) : null;
  // No goal at this point, yet the proof is unfinished: a case left open
  // elsewhere (a bullet never started). Lean's "unsolved goals" error names it.
  const stillOpen = stillOpenGoals(reply, goals);
  // When all that is left is False, say what that means (explain.ts).
  const unsolved = reply?.diagnostics.find((d) => d.severity === "error" && /^unsolved goals/.test(d.message));
  const leftFalse = unsolved && isLeftFalse(unsolved.message) ? LEFT_FALSE : null;
  const empty = !body.trim();
  /** A palette click: the move's line at the caret, its \`?\` selected to be typed over. */
  function writeMove(move: Move) {
    const { line, hole } = paletteLine(move, (goals ?? [])[0] ?? { hypotheses: [], target: "" }, !live.checking && !!reply);
    edit.current?.((text, at) => {
      const w = insertLine(text, at.line, line);
      const start = w.caret.character - line.length;
      return hole < 0 ? { text: w.text, anchor: w.caret } : { text: w.text, anchor: { line: w.caret.line, character: start + hole }, head: { line: w.caret.line, character: start + hole + 1 } };
    });
  }
  useTutorWork(lessonId, exercise.id, { ...(ladder ? { ladder } : {}), body, goals: stillOpen.length ? stillOpen : goals, error: reply?.error ? `${reply.error.line !== null ? `line ${reply.error.line + 1}: ` : ""}${reply.error.message}` : (reply?.refusal ?? null) });

  return (
    <div data-typed={exercise.id} className="overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-sm">
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <LeanEditor
            label={`Proof of: ${exercise.says}`}
            header={header ?? `example ${exercise.statement} := by`}
            value={body}
            rows={7}
            errorLines={errors.map((d) => d.line as number)}
            stale={live.checking || !!live.trouble}
            // A line a search proposes ("Try this") is never a mark: where the exercise
            // allows searching it is shown below, and where it does not it stays unsaid.
            marks={(reply?.diagnostics ?? []).flatMap((d) =>
              d.range && (d.severity === "error" ? errors.includes(d) : !/^Try this/m.test(d.message)) ? [{ severity: d.severity, message: d.message, range: d.range }] : [],
            )}
            names={(goals ?? []).flatMap((g) => g.hypotheses.flatMap((h) => h.names))}
            onChange={(text, c) => {
              setBody(text);
              setCaret(c);
            }}
            onCaret={setCaret}
            editRef={edit}
          />
          {palette && <Palette key={paletteOpen ? "open" : "shut"} moves={palette} open={paletteOpen} write={(move) => writeMove(move)} />}
          <SymbolHelp />
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={submit} disabled={submitting || empty}>
              Check
            </Button>
            <span className="text-sm text-fg-3" aria-live="polite">
              {live.checking ? "Lean is checking…" : solved ? "Lean accepts this proof." : ""}
            </span>
          </div>
        </div>

        <div className="min-w-0" aria-live="polite">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">
            {solved ? "Proof state" : stillOpen.length ? "Still open" : reply?.cursorGoals ? `At line ${caret.line + 1}` : "After your last line"}
          </div>
          {live.trouble || trouble ? (
            <Notice tone="warn">{live.trouble ?? trouble}</Notice>
          ) : !goals ? (
            <div className="py-6 text-sm text-fg-3">Waking Lean up…</div>
          ) : solved ? (
            <Closed>
              <strong>No goals left.</strong> Lean accepts this proof.
            </Closed>
          ) : goals.length === 0 && stillOpen.length ? (
            <div data-still-open>
              <p className="mb-2 text-sm text-fg-2">Nothing is left to prove here, but {stillOpen.length === 1 ? "this case is" : "these cases are"} not finished yet:</p>
              <GoalView goals={stillOpen} />
            </div>
          ) : goals.length === 0 ? (
            // No goal here, yet Lean has not accepted the proof: it could not be
            // read this far, or was refused, or another case is still open.
            <div className="py-6 text-sm text-fg-3">{reply?.refusal ? "This proof is not accepted. The note below says why." : "Nothing to show at this point, but the proof is not finished yet."}</div>
          ) : (
            <GoalView goals={goals} />
          )}
        </div>
      </div>

      {found.length > 0 && (
        <div className="border-t border-line px-4 py-3 sm:px-5" data-suggestion>
          <Notice tone="good">
            Lean searched its library and suggests: <code className="font-mono">{found[0]}</code>. In finished work that line goes in place of the search.
          </Notice>
        </div>
      )}

      {reply && !solved && (errors.length > 0 || reply.forbidden.length > 0 || reply.refusal || verdict) && (
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:px-5">
          {reply.forbidden.length > 0 && (
            <Notice tone="warn">
              This exercise is about doing the steps yourself, so <code className="font-mono">{reply.forbidden.join(", ")}</code> is switched off here.
            </Notice>
          )}
          {reply.refusal && <Notice tone="warn">{reply.refusal}</Notice>}
          {errors.map((d, i) => (
            <Refusal key={i} plain={`Line ${(d.line as number) + 1}: ${explain(d.message) ?? d.message.split("\n")[0]}`} raw={d.message} />
          ))}
          {verdict && !verdict.solved && errors.length === 0 && reply.forbidden.length === 0 && !reply.refusal && (
            <Notice tone="warn">{empty ? "Nothing to check yet." : leftFalse ? `Not finished. ${leftFalse}` : "Not finished: every line is fine, but there is still something left to show. The panel says what."}</Notice>
          )}
        </div>
      )}
      {reply?.map && !live.trouble && (
        <ProofMap
          start={reply.map.start}
          steps={reply.map.steps}
          picked={caret.line}
          stale={live.checking}
          // The node's line, selected in the editor (and so its goals shown beside it).
          onPick={(line) => edit.current?.((text) => ({ text, anchor: { line, character: 0 }, head: { line, character: text.split("\n")[line]?.length ?? 0 } }))}
        />
      )}
    </div>
  );
}
