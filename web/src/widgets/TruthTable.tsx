import { useMemo, useState } from "react";
import { evaluate, lettersOf, parseFormula, partsOf, rowsOf, show } from "../../shared/truthtable.ts";
import { Button, cx, Notice } from "../ui.tsx";
import { bool, str } from "./params.ts";
import type { WidgetProps } from "./types.ts";

// `truth-table`: every row of a formula's truth table, its parts as columns
// on the way to the whole. With `fill` the learner writes the last column.

const T = (v: boolean) => (v ? "T" : "F");

export function TruthTable({ params }: WidgetProps) {
  const formula = useMemo(() => parseFormula(str(params, "formula", "")), [params]);
  const steps = bool(params, "steps", true);
  const fill = bool(params, "fill", false);
  const caption = str(params, "caption", "");
  const ok = typeof formula !== "string";
  const letters = ok ? lettersOf(formula) : [];
  const rows = rowsOf(letters);
  // The whole formula is the last part (the registry asks for a connective, so there is one).
  const columns = ok ? (steps ? partsOf(formula) : [formula]) : [];
  const [guess, setGuess] = useState<(boolean | null)[]>(() => rows.map(() => null));
  const [checked, setChecked] = useState(false);
  if (!ok) return <Notice tone="warn">{`This truth table cannot be drawn: ${formula}`}</Notice>;

  const whole = rows.map((row) => evaluate(formula, row));
  const wrong = guess.flatMap((g, i) => (g !== null && g !== whole[i] ? [i] : []));
  const done = checked && guess.every((g) => g !== null) && !wrong.length;
  const always = whole.every(Boolean);
  const holds = whole.filter(Boolean).length;
  const rowsSaid = rows.length === 1 ? "the one row" : `all ${rows.length} rows`;
  const cell = "border-b border-line px-3 py-1.5 text-center font-mono";

  return (
    <figure data-widget="truth-table" className="max-w-3xl rounded-2xl border border-line-strong bg-panel p-4 shadow-sm sm:p-5">
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="text-fg-2">
              {letters.map((l) => (
                <th key={l} className={cx(cell, "lean font-semibold")}>
                  {l}
                </th>
              ))}
              {columns.map((c, j) => (
                <th key={j} className={cx(cell, "lean whitespace-nowrap font-semibold", j === 0 && "border-l-2 border-l-line-strong", j === columns.length - 1 && "text-fg")}>
                  {show(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} data-row={i}>
                {letters.map((l) => (
                  <td key={l} className={cx(cell, "text-fg-2")}>
                    {T(row[l])}
                  </td>
                ))}
                {columns.map((c, j) => {
                  const last = j === columns.length - 1;
                  const v = evaluate(c, row);
                  if (!(last && fill))
                    return (
                      <td key={j} className={cx(cell, j === 0 && "border-l-2 border-l-line-strong", last ? (v ? "font-semibold text-good" : "font-semibold text-bad") : "text-fg-3")}>
                        {T(v)}
                      </td>
                    );
                  const g = guess[i];
                  return (
                    <td key={j} className={cx(cell, j === 0 && "border-l-2 border-l-line-strong")}>
                      <button
                        type="button"
                        data-cell={i}
                        aria-label={`Row ${i + 1}: ${g === null ? "not filled" : T(g)}. Press to change.`}
                        onClick={() => {
                          setChecked(false);
                          setGuess((gs) => gs.map((x, k) => (k === i ? (x === null ? true : x ? false : null) : x)));
                        }}
                        className={cx("h-7 w-9 rounded-md border-2 font-semibold", checked && wrong.includes(i) ? "border-bad text-bad" : "border-line-strong text-fg")}
                      >
                        {g === null ? "·" : T(g)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fill && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => setChecked(true)} disabled={guess.some((g) => g === null)}>
            Check the column
          </Button>
          <span aria-live="polite" className="contents">
          {!checked && guess.some((g) => g === null) && <span className="text-sm text-fg-3">Press each cell for T or F.</span>}
          {checked && wrong.length > 0 && <span className="text-sm text-bad">{wrong.length === 1 ? "One row is wrong" : `${wrong.length} rows are wrong`}: marked in red.</span>}
          {done && <span className="text-sm text-good">{always ? "Every row is right, and every row is T: it holds whatever the letters are." : "Every row is right."}</span>}
          </span>
        </div>
      )}
      {(caption || !fill) && (
        <figcaption className="mt-3 text-sm text-fg-2">
          {caption ||
            (always
              ? `True in ${rowsSaid}. A proof would show it once, for every row at the same time.`
              : `True in ${holds} of ${rows.length} rows, so not always. A table checks the cases one by one; a proof argues once, for all of them.`)}
        </figcaption>
      )}
    </figure>
  );
}
