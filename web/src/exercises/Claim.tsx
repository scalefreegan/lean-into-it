import type { Exercise } from "../../shared/content.ts";
import { isSounding, spokenBlocks } from "../../shared/tts/speakable.ts";
import { useReadingLine } from "../listen/data.ts";
import { cx } from "../ui.tsx";

/** What every exercise opens with: the claim in words, and the definitions
 *  it is about when it has any. */
export function Claim({ exercise }: { exercise: Exercise }) {
  // Listen mode reading this claim: its words one by one, the one sounding marked.
  const reading = useReadingLine(exercise.id);
  // The claim's words as Listen mode numbers them: a formula in it may be said in several words.
  const words = reading ? spokenBlocks(exercise.says).flatMap((b) => b.words) : null;
  return (
    // The lesson page spaces its parts by 0.75rem; the claim sits closer to the title above it.
    <div className="-mt-2">
      <p className="font-display text-lg italic text-fg-2">
        {words
          ? words.map((w, i) => {
              const on = isSounding(w, reading!.word);
              return (
                <span key={i}>
                  {i > 0 && " "}
                  <span data-reading={on || undefined} className={cx(on && "rounded-sm bg-accent-soft text-fg")}>
                    {w.text}
                  </span>
                </span>
              );
            })
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
