import type { ReactNode } from "react";
import { INLINE, isSounding, spokenBlocks, type SpokenBlock } from "../shared/tts/speakable.ts";
import { cx } from "./ui.tsx";

// The small markdown subset lessons are written in (docs/CONTENT.md):
// ## and ### headings, paragraphs, **bold**, *italic*, `code`, bulleted and
// numbered lists, fenced code blocks, and > block quotes (shown as a "key
// idea" box). A code span's spoken form, `code`{say: …}, is for Listen mode
// and is not shown. Rendered to React elements directly: lesson text never
// becomes raw HTML. Ported from Fret Not, plus code fences.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE.source, "g");
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${n++}`;
    if (tok.startsWith("`")) out.push(<code key={key}>{tok.slice(1, tok.indexOf("`", 1))}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={key}>{inline(tok.slice(2, -2), key)}</strong>);
    else out.push(<em key={key}>{inline(tok.slice(1, -1), key)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Something to offer under a code block (the Tutor's "Insert" in the Playground). */
export type CodeAction = (code: string, lang?: string) => ReactNode;

export function Markdown({ source, codeAction }: { source: string; codeAction?: CodeAction }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
  const isNumber = (l: string) => /^\s*\d+[.)]\s+/.test(l);
  const isFence = (l: string) => /^```/.test(l);
  // A code block ends at a line of at least as many backticks as opened it
  // and nothing else, so a longer fence can quote a shorter one (the loader
  // reads fences the same way: web/server/loader.ts parseBlocks).
  const closes = (l: string, opener: string) => new RegExp(`^\`{${/^`+/.exec(opener)![0].length},}[ \\t]*$`).test(l);
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;
    if (!line.trim()) {
      i++;
    } else if (isFence(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !closes(lines[i], line)) buf.push(lines[i++]);
      i++;
      out.push(<pre key={key}>{buf.join("\n")}</pre>);
      if (codeAction) out.push(<div key={`${key}a`}>{codeAction(buf.join("\n"), /^`+\s*([A-Za-z0-9]*)/.exec(line)?.[1] ?? "")}</div>);
    } else if (/^###\s+/.test(line)) {
      out.push(<h3 key={key}>{inline(line.replace(/^###\s+/, ""), key)}</h3>);
      i++;
    } else if (/^#{1,2}\s+/.test(line)) {
      out.push(<h2 key={key}>{inline(line.replace(/^#{1,2}\s+/, ""), key)}</h2>);
      i++;
    } else if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(<blockquote key={key}>{inline(buf.join(" "), key)}</blockquote>);
    } else if (isBullet(line) || isNumber(line)) {
      const ordered = isNumber(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? isNumber(lines[i]) : isBullet(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length > 0))) {
        if (/^\s{2,}\S/.test(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])) items[items.length - 1] += ` ${lines[i].trim()}`;
        else items.push(lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""));
        i++;
      }
      const lis = items.map((t, j) => <li key={j}>{inline(t, `${key}-${j}`)}</li>);
      out.push(ordered ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?|```)/.test(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])) buf.push(lines[i++].trim());
      out.push(<p key={key}>{inline(buf.join(" "), key)}</p>);
    }
  }
  return <div className="prose-lesson">{out}</div>;
}

/* ------------------------------- Listen mode ------------------------------ */

const WORD_ON = "rounded-sm bg-accent-soft text-fg";
/** Code has a background of its own: the one being said gets a ring, which takes no room. */
const CODE_ON = "text-fg outline-2 outline-accent";

/** A block's words in order, drawn as Markdown draws the same text (so
 *  nothing moves when a block starts being read): each word is cut where
 *  its marking changes, and a `code` span is one piece of code. Every piece
 *  of a word carries data-word (its first spoken word); the pieces of the
 *  word being said are marked, a whole formula at once. */
function renderWords(block: SpokenBlock, activeWord: number | null | undefined, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const styled = (node: ReactNode, mark: { bold: boolean; italic: boolean }, key: string): ReactNode => {
    const em = mark.italic ? <em key={key}>{node}</em> : node;
    return mark.bold ? <strong key={key}>{em}</strong> : em;
  };
  block.words.forEach((w, j) => {
    if (j > 0) {
      const gap = block.gaps[j - 1];
      out.push(gap.bold || gap.italic ? styled(" ", gap, `${keyBase}-g${j}`) : " ");
    }
    const on = isSounding(w, activeWord);
    w.parts.forEach((p, n) => {
      const key = `${keyBase}-${j}-${n}`;
      const mark = { "data-word": w.index, "data-reading": on || undefined };
      out.push(
        styled(
          p.code ? (
            <code key={key} {...mark} className={cx(on && CODE_ON)}>
              {p.text}
            </code>
          ) : (
            <span key={key} {...mark} className={cx(on && WORD_ON)}>
              {p.text}
            </span>
          ),
          p,
          key,
        ),
      );
    });
  });
  return out;
}

/** The same subset as Markdown, for a passage being read aloud: each word
 *  is its own element (from shared/tts/speakable.ts spokenBlocks, which
 *  splits blocks as Markdown does), so `activeWord`, the index of the word
 *  sounding, can be marked. Code blocks are shown and not read. A second
 *  component and not a prop: only the passage being read pays for the
 *  per-word elements. */
export function SpokenMarkdown({ source, activeWord, codeAction }: { source: string; activeWord?: number | null; codeAction?: CodeAction }) {
  const blocks = spokenBlocks(source);
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const key = `s${k++}`;
    if (b.kind === "bullet" || b.kind === "number") {
      const items: typeof blocks = [];
      while (i < blocks.length && blocks[i].kind === b.kind && blocks[i].list === b.list) items.push(blocks[i++]);
      const lis = items.map((it, j) => <li key={j}>{renderWords(it, activeWord, `${key}-${j}`)}</li>);
      out.push(b.kind === "number" ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
      continue;
    }
    if (b.kind === "code") {
      // With a summary to say, the block is one word of the passage, marked while the summary is said.
      const on = b.words.length > 0 && isSounding(b.words[0], activeWord);
      out.push(
        <pre key={key} {...(b.words.length ? { "data-word": b.words[0].index, "data-reading": on || undefined } : {})} className={cx(on && CODE_ON)}>
          {b.code}
        </pre>,
      );
      if (codeAction) out.push(<div key={`${key}a`}>{codeAction(b.code ?? "")}</div>);
    }
    else {
      const words = renderWords(b, activeWord, key);
      if (b.kind === "h2") out.push(<h2 key={key}>{words}</h2>);
      else if (b.kind === "h3") out.push(<h3 key={key}>{words}</h3>);
      else if (b.kind === "quote") out.push(<blockquote key={key}>{words}</blockquote>);
      else out.push(<p key={key}>{words}</p>);
    }
    i++;
  }
  return <div className="prose-lesson">{out}</div>;
}
