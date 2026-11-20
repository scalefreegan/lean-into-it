import { useState } from "react";
import { EXPLORERS, LAB_FIRST_LINE, labSource, moveDoes, TACTIC_EXAMPLES } from "../../shared/lab.ts";
import { tacticsOf } from "../../shared/progress.ts";
import { LeanPad } from "../proof/LeanPad.tsx";
import { href } from "../router.ts";
import { useApp } from "../state.tsx";
import { LAB_KEY, useTutorSource } from "../tutor/store.ts";
import { Button, cx, Notice } from "../ui.tsx";
import { RenderWidget } from "../widgets/RenderWidget.tsx";
import { FamousProofs } from "./FamousProofs.tsx";

// The Lab: the open side of the app. Explorers to play with and every move
// with an example to run, in no order, and nothing scored: nothing here
// asks the server to record anything (an example is checked the way a
// Playground file is). What is on offer is data in web/shared/lab.ts.
//   #/lab            the moves
//   #/lab/<tool>     one explorer, or "moves"
//   #/lab/famous     the Famous Proofs gallery (FamousProofs.tsx); /<id> for one

const MOVES_TOOL = { id: "moves", title: "Moves", blurb: "Every move, with an example to run and change." };
const FAMOUS_TOOL = { id: "famous", title: "Famous proofs", blurb: "Classic proofs, in words and in Lean." };

export function Lab({ tool, sub }: { tool?: string; sub?: string }) {
  const tools = [MOVES_TOOL, FAMOUS_TOOL, ...EXPLORERS];
  // With no tool named, the moves; with a name nothing has, nothing is marked as open.
  const current = tool ? tools.find((t) => t.id === tool) : MOVES_TOOL;
  const explorer = EXPLORERS.find((e) => e.id === current?.id);
  return (
    <div className="mx-auto flex max-w-[2400px] flex-col gap-6" data-lab>
      <header>
        <h1 className="text-4xl font-semibold text-fg">Lab</h1>
        <p className="mt-2 max-w-2xl text-lg text-fg-2">Everything here is open and nothing is scored. Change things and see what happens.</p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Lab tools">
        {tools.map((t) => {
          const on = t.id === current?.id;
          return (
            <a
              key={t.id}
              href={href("lab", t.id)}
              data-lab-tool={t.id}
              aria-current={on ? "page" : undefined}
              className={cx("rounded-xl border px-4 py-2.5 transition-colors", on ? "border-accent bg-accent-soft" : "border-line bg-panel hover:bg-raised")}
            >
              <span className="block font-semibold text-fg">{t.title}</span>
              <span className="block text-sm text-fg-3">{t.blurb}</span>
            </a>
          );
        })}
        <a href={href("playground")} data-lab-tool="playground" className="rounded-xl border border-line bg-panel px-4 py-2.5 transition-colors hover:bg-raised">
          <span className="block font-semibold text-fg">Playground →</span>
          <span className="block text-sm text-fg-3">A whole Lean file of your own.</span>
        </a>
      </nav>

      {!current ? (
        <Notice tone="warn">
          There is nothing in the Lab called “{tool}”.{" "}
          <a className="font-semibold text-accent underline" href={href("lab")}>
            The Lab
          </a>
        </Notice>
      ) : current.id === FAMOUS_TOOL.id ? (
        <FamousProofs {...(sub ? { id: sub } : {})} />
      ) : explorer ? (
        <div className="flex flex-col gap-8" key={explorer.id}>
          {explorer.widgets.map((w, i) => (
            <section key={i} data-lab-widget={w.type} className="flex flex-col gap-2">
              <p className="max-w-[96ch] text-fg-2">{w.note}</p>
              <RenderWidget type={w.type} params={w.params} />
            </section>
          ))}
        </div>
      ) : (
        <MoveReference />
      )}
    </div>
  );
}

/** Every move the curriculum teaches, level by level; one at a time opens as a Lean file to run. */
function MoveReference() {
  const { content } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  // What has been typed into the open example. Closing it, or opening another, starts from the example again.
  const [source, setSource] = useState("");
  // Counts fresh starts: each one is a new pad, cursor back in the proof and nothing to undo.
  const [starts, setStarts] = useState(0);
  useTutorSource(open ? source : "", LAB_KEY);

  const show = (tactic: string | null) => {
    setOpen(tactic);
    setStarts((n) => n + 1);
    setSource(tactic ? labSource(TACTIC_EXAMPLES[tactic].lean) : "");
  };

  return (
    <div className="flex flex-col gap-6">
      {content.levels
        .filter((l) => l.moves.length > 0)
        .map((level) => (
          <section key={level.id} data-lab-level={level.id}>
            <h2 className="flex items-baseline gap-3">
              <span className="font-mono text-sm font-semibold text-accent">Level {level.id}</span>
              <span className="text-xl font-semibold text-fg">{level.title}</span>
            </h2>
            <ul className="mt-2 flex flex-col divide-y divide-line rounded-2xl border border-line-strong bg-panel">
              {/* A move taught again in a later level is listed where it first appears. */}
              {level.moves
                .filter((t) => !tacticsOf({ levels: content.levels.filter((l) => l.id < level.id) }).includes(t))
                .map((t) => {
                  const example = Object.hasOwn(TACTIC_EXAMPLES, t) ? TACTIC_EXAMPLES[t] : null;
                  const on = open === t;
                  return (
                    <li key={t} data-lab-move={t} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <code className="w-28 shrink-0 font-mono font-semibold text-fg">{t}</code>
                        <span className="min-w-0 flex-1 text-sm text-fg-2">{moveDoes(t)}</span>
                        {example && (
                          <Button aria-expanded={on} aria-label={on ? `Close the example of ${t}` : `Run an example of ${t}`} onClick={() => show(on ? null : t)}>
                            {on ? "Close" : "Run an example"}
                          </Button>
                        )}
                      </div>
                      {example && on && (
                        <div className="mt-3 flex flex-col gap-3" data-lab-example={t}>
                          <p className="max-w-[96ch] text-sm text-fg-2">
                            <span className="font-semibold text-fg">Watch for:</span> {example.watch}
                          </p>
                          <LeanPad key={`${t}:${starts}`} label={`An example of ${t}`} source={source} onChange={setSource} rows={Math.max(6, source.split("\n").length + 1)} startAt={{ line: LAB_FIRST_LINE + 1, character: 0 }} />
                          <p className="text-sm text-fg-3">
                            <button type="button" className="font-semibold text-accent underline-offset-2 hover:underline" onClick={() => show(t)}>
                              Start this example again
                            </button>
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
    </div>
  );
}
