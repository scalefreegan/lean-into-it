import type { Exercise } from "../../shared/content.ts";
import { useReadingLine } from "../listen/data.ts";
import { cx } from "../ui.tsx";

/** What every exercise opens with: the claim in words, and the definitions
 *  it is about when it has any. */
export function Claim({ exercise }: { exercise: Exercise }) {
  // Listen mode reading this claim: its words one by one, the one sounding marked.
  const reading = useReadingLine(exercise.id);
  const words = reading ? exercise.says.split(/\s+/).filter(Boolean) : null;
  return (
    // The lesson page spaces its parts by 0.75rem; the claim sits closer to the title above it.
    <div className="-mt-2">
      <p className="font-display text-lg italic text-fg-2">
        {words
          ? words.map((w, i) => (
              <span key={i}>
                {i > 0 && " "}
                <span data-reading={i === reading!.word || undefined} className={cx(i === reading!.word && "rounded-sm bg-accent-soft text-fg outline-2 outline-accent-soft")}>
                  {w}
                </span>
              </span>
            ))
          : exercise.says}
      </p>
      {exercise.given && (
        <details className="mt-2" data-given>
          <summary className="cursor-pointer text-sm font-semibold text-fg-3">The definitions this is about</summary>
          <pre className="lean mt-2 overflow-x-auto rounded-xl border border-line bg-raised px-4 py-3 text-sm leading-6 text-fg-2">{exercise.given}</pre>
        </details>
      )}
    </div>
  );
}
