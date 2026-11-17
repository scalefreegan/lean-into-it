import { useRef } from "react";
import { expandAt, positionAt } from "../../shared/abbrev.ts";
import type { Position } from "../../shared/proof.ts";
import { cx } from "../ui.tsx";

// A plain editor for Lean: a monospaced textarea with line numbers, Tab as
// two spaces, and backslash names for symbols (\to then a space gives →).
// It reports the text and the caret; what Lean thinks is the caller's job.

interface Props {
  value: string;
  onChange: (value: string, caret: Position) => void;
  onCaret: (caret: Position) => void;
  /** 0-based lines to mark as having an error. */
  errorLines?: number[];
  rows?: number;
  label: string;
  /** Shown before the first line, not editable (an exercise's statement). */
  header?: string;
}

export function LeanEditor({ value, onChange, onCaret, errorLines = [], rows = 8, label, header }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lineCount = Math.max(value.split("\n").length, rows);
  const errors = new Set(errorLines);

  function set(text: string, caret: number) {
    onChange(text, positionAt(text, caret));
    // The caret is restored after React has written the new value.
    requestAnimationFrame(() => ref.current?.setSelectionRange(caret, caret));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === " " || e.key === "Tab") && el.selectionStart === el.selectionEnd) {
      const expanded = expandAt(el.value, el.selectionStart);
      if (expanded) {
        e.preventDefault();
        set(expanded.text, expanded.caret);
        return;
      }
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const start = el.selectionStart;
      set(el.value.slice(0, start) + "  " + el.value.slice(el.selectionEnd), start + 2);
    }
  }

  const report = (el: HTMLTextAreaElement) => onCaret(positionAt(el.value, el.selectionStart));

  return (
    <div className="overflow-hidden rounded-xl border border-line-strong bg-panel">
      {header && <pre className="lean border-b border-line bg-raised/60 px-3 py-2 pl-12 text-sm text-fg-3">{header}</pre>}
      <div className="flex">
        <div aria-hidden="true" className="select-none bg-raised/60 py-2 text-right font-mono text-sm leading-6 text-fg-3">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={cx("px-2", errors.has(i) && "bg-bad-soft font-semibold text-bad")}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={ref}
          aria-label={label}
          value={value}
          rows={lineCount}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          wrap="off"
          onChange={(e) => onChange(e.target.value, positionAt(e.target.value, e.target.selectionStart))}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => report(e.currentTarget)}
          onClick={(e) => report(e.currentTarget)}
          className="lean lean-editor block w-full min-w-0 resize-none bg-transparent px-3 py-2 text-sm leading-6 text-fg outline-none"
        />
      </div>
    </div>
  );
}

/** The symbols worth knowing, shown under an editor. */
export function SymbolHelp() {
  const items: [string, string][] = [["\\to", "→"], ["\\and", "∧"], ["\\or", "∨"], ["\\not", "¬"], ["\\forall", "∀"], ["\\exists", "∃"], ["\\R", "ℝ"], ["\\N", "ℕ"], ["\\le", "≤"], ["\\ne", "≠"]];
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-3">
      <span>Symbols: type a name, then a space.</span>
      {items.map(([name, symbol]) => (
        <span key={name} className="whitespace-nowrap font-mono">
          {name} {symbol}
        </span>
      ))}
    </p>
  );
}
