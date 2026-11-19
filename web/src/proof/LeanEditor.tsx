import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { Annotation, EditorState, RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutterLineClass, hoverTooltip, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { expandAt } from "../../shared/abbrev.ts";
import { changeBetween, completionsFor, depthAfter, nextToken, type LexState } from "../../shared/leaneditor.ts";
import type { Position } from "../../shared/proof.ts";

// The editor for Lean: CodeMirror 6 with Lean's colours, backslash names
// for symbols (\to then a space gives →), Tab as two spaces, completion of
// tactic names and of the names in the current goal, and a wavy underline
// with Lean's message on hover where Lean pointed. It reports the text and
// the caret; what Lean thinks is the caller's job.

/** Somewhere Lean pointed, in the editor's own lines and columns. */
export interface EditorMark {
  severity: "error" | "warning" | "info";
  message: string;
  range: { start: Position; end: Position };
}

interface Props {
  value: string;
  onChange: (value: string, caret: Position) => void;
  onCaret: (caret: Position) => void;
  /** Where the caret is when the editor is made. Default: the very start. */
  startAt?: Position;
  /** 0-based lines to mark as having an error. */
  errorLines?: number[];
  /** Where Lean pointed: underlined, with the message on hover. */
  marks?: EditorMark[];
  /** True while `marks` are Lean's answer to an earlier text (a check is on
   *  its way). The underlines then stay where the edits moved them; when the
   *  answer for this text arrives they are drawn afresh, the same or not. */
  stale?: boolean;
  /** Names worth completing: the hypotheses and objects of the current goal. */
  names?: string[];
  rows?: number;
  label: string;
  /** Shown before the first line, not editable (an exercise's statement). */
  header?: string;
}

const lean = StreamLanguage.define<LexState>({
  name: "lean",
  startState: () => ({ depth: 0 }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    const t = nextToken(stream.string, stream.pos, state);
    stream.pos = t.end;
    return t.kind === "tactic" ? "atom" : t.kind === "sorry" ? "invalid" : t.kind === "type" ? "typeName" : t.kind;
  },
});

// Colours are the tokens of index.css. Teal, amber and green are kept for
// the proof state (facts, goal, closed), so the code uses none of them.
const colours = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--accent)" },
  { tag: tags.atom, color: "var(--accent)", fontWeight: "600" },
  { tag: tags.comment, color: "var(--fg-3)", fontStyle: "italic" },
  { tag: [tags.string, tags.number], color: "var(--warn)" },
  { tag: tags.typeName, color: "var(--fg-2)", fontWeight: "600" },
  { tag: tags.invalid, color: "var(--bad)", fontWeight: "600" },
]);

const theme = EditorView.theme({
  "&": { color: "var(--fg)", backgroundColor: "transparent", fontSize: "0.875rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", fontVariantLigatures: "none", lineHeight: "1.5rem", overflowX: "auto" },
  ".cm-content": { padding: "0.5rem 0", caretColor: "var(--fg)", minHeight: "var(--lean-editor-min)" },
  ".cm-gutter": { minHeight: "var(--lean-editor-min)" },
  ".cm-line": { padding: "0 0.75rem" },
  ".cm-cursor": { borderLeftColor: "var(--fg)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--accent-soft)" },
  ".cm-gutters": { backgroundColor: "color-mix(in srgb, var(--raised) 60%, transparent)", color: "var(--fg-3)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.5rem", minWidth: "2rem" },
  ".cm-gutterElement.lean-error-line": { backgroundColor: "var(--bad-soft)", color: "var(--bad)", fontWeight: "600" },
  ".lean-mark-error": { textDecoration: "underline wavy var(--bad)", textDecorationSkipInk: "none", textUnderlineOffset: "3px" },
  ".lean-mark-warning": { textDecoration: "underline wavy var(--warn)", textDecorationSkipInk: "none", textUnderlineOffset: "3px" },
  ".lean-mark-info": { textDecoration: "underline dotted var(--fg-3)", textUnderlineOffset: "3px" },
  ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--fg)", border: "1px solid var(--line-strong)", borderRadius: "0.5rem", boxShadow: "0 4px 16px var(--grid)" },
  ".cm-tooltip .lean-hover": { padding: "0.4rem 0.6rem", maxWidth: "32rem", whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" },
  ".cm-tooltip-autocomplete ul li": { padding: "0.1rem 0.5rem" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--accent-ink)" },
  ".cm-completionDetail": { color: "inherit", opacity: "0.7", fontStyle: "normal", marginLeft: "0.75rem" },
});

/** A change that came from the page (the value prop), not from typing: not reported back. */
const fromOutside = Annotation.define<boolean>();

interface Marked {
  marks: EditorMark[];
  errorLines: number[];
}
const setMarked = StateEffect.define<Marked>();

const errorLine = new (class extends GutterMarker {
  elementClass = "lean-error-line";
})();

/** A position as a document offset, kept inside the document. */
function offsetOf(state: EditorState, p: Position): number {
  if (p.line < 0) return 0;
  if (p.line >= state.doc.lines) return state.doc.length;
  const line = state.doc.line(p.line + 1);
  return line.from + Math.min(Math.max(p.character, 0), line.length);
}

/** The span to underline: Lean's, widened to one character when it is empty. */
function spanOf(state: EditorState, m: EditorMark): { from: number; to: number } {
  const from = offsetOf(state, m.range.start);
  const to = Math.max(from, offsetOf(state, m.range.end));
  if (to > from) return { from, to };
  const line = state.doc.lineAt(from);
  if (from < line.to) return { from, to: from + 1 };
  return from > line.from ? { from: from - 1, to: from } : { from, to };
}

/** The marks as Lean gave them (their positions are of the text Lean saw), and what they draw. */
const marked = StateField.define<Marked & { underlines: DecorationSet; gutter: RangeSet<GutterMarker> }>({
  create: () => ({ marks: [], errorLines: [], underlines: Decoration.none, gutter: RangeSet.empty }),
  update(value, tr) {
    const effect = tr.effects.find((e) => e.is(setMarked));
    if (!effect) return tr.docChanged ? { ...value, underlines: value.underlines.map(tr.changes), gutter: value.gutter.map(tr.changes) } : value;
    const { marks, errorLines } = effect.value;
    const spans = marks
      .map((m) => ({ ...spanOf(tr.state, m), severity: m.severity, message: m.message }))
      .filter((s) => s.to > s.from)
      .sort((a, b) => a.from - b.from || a.to - b.to);
    const lines = [...new Set(errorLines)].filter((l) => l >= 0 && l < tr.state.doc.lines).sort((a, b) => a - b);
    return {
      marks,
      errorLines,
      underlines: Decoration.set(spans.map((s) => Decoration.mark({ class: `lean-mark-${s.severity}`, message: s.message }).range(s.from, s.to))),
      gutter: RangeSet.of(lines.map((l) => errorLine.range(tr.state.doc.line(l + 1).from))),
    };
  },
  provide: (f) => [EditorView.decorations.from(f, (v) => v.underlines), gutterLineClass.from(f, (v) => v.gutter)],
});

/** Lean's message for what is under the pointer. */
const hover = hoverTooltip((view, pos) => {
  // The underlines as they are now (moved along with the text since Lean answered).
  const found: { from: number; to: number; message: string }[] = [];
  view.state.field(marked).underlines.between(pos, pos, (from, to, deco) => {
    found.push({ from, to, message: String(deco.spec.message) });
  });
  if (!found.length) return null;
  return {
    pos: Math.min(...found.map((s) => s.from)),
    end: Math.max(...found.map((s) => s.to)),
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "lean-hover";
      dom.textContent = [...new Set(found.map((s) => s.message.trim()))].join("\n\n");
      return { dom };
    },
  };
});

const positionOf = (state: EditorState): Position => {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number - 1, character: head - line.from };
};

/** A backslash name before the caret becomes its symbol; true when one did. */
function expand(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const text = view.state.doc.toString();
  const expanded = expandAt(text, sel.head);
  if (!expanded) return false;
  view.dispatch({ changes: changeBetween(text, expanded.text), selection: { anchor: expanded.caret }, userEvent: "input.type" });
  return true;
}

export function LeanEditor({ value, onChange, onCaret, startAt, errorLines = [], marks = [], stale = false, names = [], rows = 8, label, header }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The latest props, for the editor's own callbacks (it is made once).
  const latest = useRef({ onChange, onCaret, names });
  latest.current = { onChange, onCaret, names };

  useEffect(() => {
    const complete = (context: CompletionContext): CompletionResult | null => {
      const line = context.state.doc.lineAt(context.pos);
      const depth = depthAfter(context.state.doc.sliceString(0, line.from).split("\n"));
      const found = completionsFor(line.text.slice(0, context.pos - line.from), latest.current.names, depth);
      if (!found) return null;
      return {
        from: line.from + found.from,
        options: found.options.map((o) => ({ label: o.label, type: o.kind === "tactic" ? "keyword" : "variable", detail: o.kind === "tactic" ? "tactic" : "on the board" })),
        validFor: /^[\p{L}_][\p{L}\p{N}_'!?₀-₉]*$/u,
      };
    };
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      lean,
      syntaxHighlighting(colours),
      marked,
      hover,
      // Nothing is chosen until the learner chooses (arrow keys, or a click): Enter
      // after `simp` ends the line, and does not turn it into `simp_all`.
      autocompletion({ override: [complete], icons: false, selectOnOpen: false }),
      keymap.of([
        // A symbol's name, then a space or Tab: the symbol, and the key is used up (as in Lean's own editors).
        { key: "Space", run: expand },
        { key: "Tab", run: (v) => expand(v) || (v.dispatch(v.state.replaceSelection("  "), { userEvent: "input.type" }), true) },
        ...completionKeymap,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorState.tabSize.of(2),
      EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false", autocapitalize: "off", autocorrect: "off" }),
      EditorView.updateListener.of((u) => {
        if (u.transactions.some((t) => t.annotation(fromOutside))) return;
        if (u.docChanged) latest.current.onChange(u.state.doc.toString(), positionOf(u.state));
        else if (u.selectionSet) latest.current.onCaret(positionOf(u.state));
      }),
      theme,
    ];
    const first = EditorState.create({ doc: value, extensions });
    // A start past the end of the text is the end of its line, or of the text.
    const line = startAt ? first.doc.line(Math.min(Math.max(startAt.line, 0) + 1, first.doc.lines)) : null;
    const made = new EditorView({
      parent: host.current!,
      state: line ? EditorState.create({ doc: value, extensions, selection: { anchor: Math.min(line.from + Math.max(startAt!.character, 0), line.to) } }) : first,
    });
    view.current = made;
    return () => {
      made.destroy();
      view.current = null;
    };
    // Made once: the value, the marks and the names reach it through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page changed the text (Reset, the Tutor's line): the editor follows.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const text = v.state.doc.toString();
    if (text === value) return;
    // The caret moves with the text around it, and the page is told where it
    // ended up: what the page shows for "the caret" is then the editor's own.
    v.dispatch({ changes: changeBetween(text, value), annotations: fromOutside.of(true) });
    latest.current.onCaret(positionOf(v.state));
  }, [value]);

  const key = JSON.stringify([marks, errorLines]);
  useEffect(() => {
    if (!stale) view.current?.dispatch({ effects: setMarked.of({ marks, errorLines }) });
    // `key` is the marks and the lines by value: a new array of the same marks redraws nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stale]);

  return (
    <div className="overflow-hidden rounded-xl border border-line-strong bg-panel">
      {header && <pre className="lean border-b border-line bg-raised/60 px-3 py-2 pl-12 text-sm text-fg-3">{header}</pre>}
      <div ref={host} data-lean-editor style={{ "--lean-editor-min": `${rows * 1.5 + 1}rem` } as React.CSSProperties} />
    </div>
  );
}

/** The symbols worth knowing, shown under an editor. */
export function SymbolHelp() {
  const items: [string, string][] = [["\\to", "→"], ["\\and", "∧"], ["\\or", "∨"], ["\\not", "¬"], ["\\iff", "↔"], ["\\<", "⟨"], ["\\>", "⟩"], ["\\forall", "∀"], ["\\exists", "∃"], ["\\R", "ℝ"], ["\\N", "ℕ"], ["\\le", "≤"], ["\\ne", "≠"], ["\\l", "←"], ["\\|", "∣"]];
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
