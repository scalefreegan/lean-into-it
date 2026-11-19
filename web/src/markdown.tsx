import type { ReactNode } from "react";
import { spokenBlocks, type SpeakableWord } from "../shared/tts/speakable.ts";
import { cx } from "./ui.tsx";

// The small markdown subset lessons are written in (docs/CONTENT.md):
// ## and ### headings, paragraphs, **bold**, *italic*, `code`, bulleted and
// numbered lists, fenced code blocks, and > block quotes (shown as a "key
// idea" box). Rendered to React elements directly: lesson text never
// becomes raw HTML. Ported from Fret Not, plus code fences.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${n++}`;
    if (tok.startsWith("`")) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={key}>{inline(tok.slice(2, -2), key)}</strong>);
    else out.push(<em key={key}>{inline(tok.slice(1, -1), key)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
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

const WORD_ON = "rounded-sm bg-accent-soft text-fg outline-2 outline-accent-soft";

/** One word as its own element, so the one being read can be marked. */
function word(w: SpeakableWord, activeWord: number | null | undefined, key: string): ReactNode {
  const span = (
    <span key={key} data-word={w.index} data-reading={w.index === activeWord || undefined} className={cx(w.index === activeWord && WORD_ON)}>
      {w.text}
    </span>
  );
  const em = w.italic ? <em key={key}>{span}</em> : span;
  return w.bold ? <strong key={key}>{em}</strong> : em;
}

/** A block's words in order; the words of one `code` span are drawn as one piece of code. */
function renderWords(words: SpeakableWord[], activeWord: number | null | undefined, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  for (let j = 0; j < words.length; ) {
    if (j > 0) out.push(" ");
    const w = words[j];
    if (w.code === null) {
      out.push(word(w, activeWord, `${keyBase}-${j}`));
      j++;
      continue;
    }
    const run: ReactNode[] = [];
    const start = j;
    for (; j < words.length && words[j].code === w.code; j++) {
      if (j > start) run.push(" ");
      run.push(word(words[j], activeWord, `${keyBase}-${j}`));
    }
    out.push(<code key={`${keyBase}-c${start}`}>{run}</code>);
  }
  return out;
}

/** The same subset as Markdown, for a passage being read aloud: each word
 *  is its own element (from shared/tts/speakable.ts spokenBlocks, which
 *  splits blocks as Markdown does), so `activeWord`, the index of the word
 *  sounding, can be marked. Code blocks are shown and not read. A second
 *  component and not a prop: only the passage being read pays for the
 *  per-word elements. */
export function SpokenMarkdown({ source, activeWord }: { source: string; activeWord?: number | null }) {
  const blocks = spokenBlocks(source);
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const key = `s${k++}`;
    if (b.kind === "bullet" || b.kind === "number") {
      const items: typeof blocks = [];
      while (i < blocks.length && blocks[i].kind === b.kind) items.push(blocks[i++]);
      const lis = items.map((it, j) => <li key={j}>{renderWords(it.words, activeWord, `${key}-${j}`)}</li>);
      out.push(b.kind === "number" ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
      continue;
    }
    if (b.kind === "code") out.push(<pre key={key}>{b.code}</pre>);
    else {
      const words = renderWords(b.words, activeWord, key);
      if (b.kind === "h2") out.push(<h2 key={key}>{words}</h2>);
      else if (b.kind === "h3") out.push(<h3 key={key}>{words}</h3>);
      else if (b.kind === "quote") out.push(<blockquote key={key}>{words}</blockquote>);
      else out.push(<p key={key}>{words}</p>);
    }
    i++;
  }
  return <div className="prose-lesson">{out}</div>;
}
