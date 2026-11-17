import { isNatural, isObject, type Goal, type Hypothesis } from "../../shared/goals.ts";
import { cx } from "../ui.tsx";

// A proof state as cards, used by the proof board and by the panel beside
// the editor. Facts are teal, the goal is amber, a closed goal is green
// (index.css): the same three colours wherever a proof state is drawn.

/** `P Q : Prop`, `n : ℕ`: the things the statement is about. */
function Objects({ items, onPick }: { items: Hypothesis[]; onPick?: (name: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-fg-3">
      <span className="text-xs font-semibold uppercase tracking-wide">About</span>
      {items.map((h) =>
        // While induction waits for a number, each natural number is its own button.
        onPick && isNatural(h) ? (
          h.names.map((name) => (
            <button
              key={name}
              type="button"
              data-object={name}
              onClick={() => onPick(name)}
              className="lean rounded-md border border-line bg-raised px-2 py-0.5 text-fg-2 ring-2 ring-accent ring-offset-2 ring-offset-panel transition-shadow hover:shadow-md"
            >
              {name} : {h.type}
            </button>
          ))
        ) : (
          <span key={h.names.join(" ")} className="lean rounded-md border border-line bg-raised px-2 py-0.5 text-fg-2">
            {h.names.join(" ")} : {h.type}
          </span>
        ),
      )}
    </div>
  );
}

export function FactCard({ name, type, onPick, picking, fresh }: { name: string; type: string; onPick?: () => void; picking?: boolean; fresh?: boolean }) {
  const body = (
    <>
      <span className="rounded-md bg-fact px-1.5 py-0.5 font-mono text-xs font-semibold text-panel">{name}</span>
      <span className="lean text-base text-fg">{type}</span>
    </>
  );
  const base = cx("flex items-center gap-2.5 rounded-xl border-2 border-fact-line bg-fact-soft px-3 py-2 text-left", fresh && "arrive");
  if (!onPick) return <div data-fact={name} className={base}>{body}</div>;
  return (
    <button
      type="button"
      data-fact={name}
      onClick={onPick}
      className={cx(base, "transition-shadow hover:shadow-md", picking && "ring-2 ring-accent ring-offset-2 ring-offset-panel")}
    >
      {body}
    </button>
  );
}

export function GoalCard({ target, caseName, later }: { target: string; caseName?: string; later?: boolean }) {
  return (
    <div data-goal className={cx("flex items-start gap-3 rounded-xl border-2 border-goal-line bg-goal-soft px-4 py-3", later && "opacity-70")}>
      <span className="font-mono text-xl leading-7 text-goal" title="it remains to show">⊢</span>
      <div>
        {caseName && <div className="text-xs font-semibold uppercase tracking-wide text-goal">case {caseName}</div>}
        <div className={cx("lean text-fg", later ? "text-base" : "text-lg")}>{target}</div>
      </div>
    </div>
  );
}

export function Closed({ children }: { children?: React.ReactNode }) {
  return (
    <div data-closed className="arrive flex items-center gap-3 rounded-xl border-2 border-good-line bg-good-soft px-4 py-3 text-fg">
      <span className="font-mono text-xl text-good">∎</span>
      <div className="text-base">{children ?? "No goals left."}</div>
    </div>
  );
}

/**
 * The first goal in full (its facts, then what remains to show) and any
 * further goals below it, smaller: Lean works on the first one.
 * `onPickFact` makes the fact cards clickable, `onPickObject` the objects; `known` is the set of fact
 * names from before the last move, so new arrivals can be animated in.
 */
export function GoalView({
  goals,
  onPickFact,
  onPickObject,
  picking,
  known,
}: {
  goals: Goal[];
  onPickFact?: (name: string) => void;
  onPickObject?: (name: string) => void;
  picking?: boolean;
  known?: Set<string>;
}) {
  if (!goals.length) return <Closed />;
  const [first, ...rest] = goals;
  // A case name is there to tell goals apart. Alone, or when every goal has
  // the same one (as after `apply`), it is noise.
  const named = new Set(goals.map((g) => g.caseName ?? "")).size > 1;
  const objects = first.hypotheses.filter(isObject);
  const facts = first.hypotheses.filter((h) => !isObject(h));
  return (
    <div className="flex flex-col gap-3">
      <Objects items={objects} {...(onPickObject ? { onPick: onPickObject } : {})} />
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fact">Facts you have</div>
        {facts.length ? (
          <div className="flex flex-wrap gap-2">
            {facts.flatMap((h) =>
              h.names.map((name) => (
                <FactCard
                  key={name}
                  name={name}
                  type={h.type}
                  picking={picking}
                  fresh={known ? !known.has(name) : false}
                  {...(onPickFact ? { onPick: () => onPickFact(name) } : {})}
                />
              )),
            )}
          </div>
        ) : (
          <div className="text-sm text-fg-3">None yet.</div>
        )}
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-goal">Goal: it remains to show</div>
        <GoalCard target={first.target} {...(named && first.caseName ? { caseName: first.caseName } : {})} />
      </div>
      {rest.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-3">
            Then {rest.length === 1 ? "one more goal" : `${rest.length} more goals`}
          </div>
          <div className="flex flex-col gap-2">
            {rest.map((g, i) => (
              <GoalCard key={i} target={g.target} later {...(named && g.caseName ? { caseName: g.caseName } : {})} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Lean's refusal: the plain sentence, with Lean's own words on request. */
export function Refusal({ plain, raw, className }: { plain: string | null; raw: string; className?: string }) {
  return (
    <div role="alert" className={cx("rounded-xl border border-bad bg-bad-soft px-4 py-3 text-sm text-fg", className)}>
      {plain ? (
        <>
          <p>{plain}</p>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs font-semibold text-fg-3">What Lean said</summary>
            <pre className="lean mt-1.5 text-xs text-fg-2">{raw}</pre>
          </details>
        </>
      ) : (
        <pre className="lean text-xs">{raw}</pre>
      )}
    </div>
  );
}
