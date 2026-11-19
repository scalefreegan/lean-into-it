import { useState } from "react";
import { useTutorSource } from "../tutor/store.ts";
import { LeanPad } from "../proof/LeanPad.tsx";
import { Button } from "../ui.tsx";

// The Playground: any Lean, nothing scored, nothing recorded. The whole file
// is yours, statement included. The text is kept in this browser only.

const STARTER = `import Mathlib

-- Nothing here is scored. Change anything and watch the panel.
-- Put the cursor inside a proof to see the facts and the goal at that line.

example (P Q : Prop) (hP : P) (hPQ : P → Q) : Q := by
  apply hPQ
  exact hP

example (a b : ℝ) : (a + b)^2 = a^2 + 2*a*b + b^2 := by
  ring

#eval (List.range 10).map (fun n => n * n)
`;

const KEY = "lean-into-it:playground";

function stored(): string {
  try {
    return localStorage.getItem(KEY) ?? STARTER;
  } catch {
    return STARTER;
  }
}

export function Playground() {
  const [source, setSource] = useState(stored);
  useTutorSource(source);

  function change(text: string) {
    setSource(text);
    try {
      localStorage.setItem(KEY, text);
    } catch {
      /* private window: the text just isn't kept */
    }
  }

  return (
    <div className="mx-auto flex max-w-[2400px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold text-fg">Playground</h1>
          <p className="mt-1 text-fg-2">Free Lean with all of Mathlib. Nothing is scored and nothing is recorded.</p>
        </div>
        {/* The text changes under the editor that is there, so the reset can be undone like any other edit. */}
        <Button onClick={() => change(STARTER)}>Reset to the starter</Button>
      </header>

      <LeanPad label="Lean playground" source={source} onChange={change} />
    </div>
  );
}
