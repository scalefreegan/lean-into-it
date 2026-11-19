// Turns the markdown subset lessons are written in (docs/CONTENT.md: ## and
// ### headings, paragraphs, **bold**, *italic*, `code`, lists, > block
// quotes, fenced code) into plain text worth sending to a text-to-speech
// provider, plus enough structure for the page to show the same blocks with
// a highlight that moves as they are read. A sibling of
// web/src/markdown.tsx's parsing, not a refactor of it: that module makes
// React nodes; this one makes what is said and which word of the page each
// spoken word belongs to. Ported from Fret Not, plus maths and Lean:
//
//   - `code` is said from its spoken form, `code`{say: …}, or failing that
//     from the tables in say.ts, and is one unit on the page however many
//     words are said for it;
//   - symbols in running text (a², ≤, ×) are said as words;
//   - a fenced block is shown and not read, unless its opening line gives a
//     summary (```lean say: …), which is said while the block is marked.
//
// Pure: no DOM, no network.

import { sayCode, sayText } from "./say.ts";

type Range = [number, number];

export interface Speakable {
  /** The words to send to the provider. */
  text: string;
  /** [start, end) ranges in `text` said for words that were **bold** in the source. */
  boldRanges: Range[];
}

/** One word of the page: a run with no space in it, where a `code` span
 *  counts as one piece whatever is inside it. `say` is what is said for it,
 *  which may be several words or none; they are the spoken words `index` to
 *  `index + span - 1` of the passage, the order the provider's alignment
 *  comes back in (both split what was sent on the same spaces). */
export interface SpeakableWord {
  text: string;
  say: string;
  index: number;
  span: number;
  /** Whether any of it was **bold**. */
  bold: boolean;
  /** The word cut where its marking changes ("`h`," is code, then a plain
   *  comma), so it can be drawn exactly as markdown.tsx draws it. */
  parts: WordPart[];
}

export interface WordPart {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
}

/** One block of a passage, in source order. A `code` block has one word,
 *  the whole block, when its fence gives a summary to say, and none
 *  otherwise: it is shown, and the narrator passes over it. */
export interface SpokenBlock {
  kind: "h2" | "h3" | "quote" | "bullet" | "number" | "p" | "code";
  words: SpeakableWord[];
  /** A code block's text, as written. */
  code?: string;
  /** A list item's list (0, 1, … through the passage): items of one list share it. */
  list?: number;
  /** How the space after each word but the last is marked: as both its neighbours are. */
  gaps: { bold: boolean; italic: boolean }[];
}

/** A `code` span no spoken form was written for and the tables are not sure of. */
export interface SpokenGap {
  code: string;
  /** What is said for it as things are. */
  said: string;
}

/** A piece of one line: running text, or a whole `code` span with what is said for it. */
interface Piece {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  say?: string;
  /** A code span with no written form that the tables are not sure of. */
  unsure?: boolean;
}

/** The inline tokens, as markdown.tsx's `inline` reads them (code first, so
 *  a `*` inside backticks is not emphasis), plus a code span's spoken form. */
export const INLINE = /(`[^`]+`(?:\{say: ?[^}]*\})?|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
const CODE = /^`([^`]+)`(?:\{say: ?([^}]*)\})?$/;

function pieces(source: string, bold = false, italic = false): Piece[] {
  const out: Piece[] = [];
  const re = new RegExp(INLINE.source, "g");
  let last = 0;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (m.index > last) out.push({ text: source.slice(last, m.index), bold, italic, code: false });
    const tok = m[0];
    const code = CODE.exec(tok);
    if (code) {
      const said = code[2] === undefined ? sayCode(code[1]) : { text: code[2].trim(), sure: true };
      out.push({ text: code[1], bold, italic, code: true, say: said.text, ...(said.sure ? {} : { unsure: true }) });
    } else if (tok.startsWith("**")) out.push(...pieces(tok.slice(2, -2), true, italic));
    else out.push(...pieces(tok.slice(1, -1), bold, true));
    last = m.index + tok.length;
  }
  if (last < source.length) out.push({ text: source.slice(last), bold, italic, code: false });
  return out;
}

/** One line's words: runs with no space in them outside code. */
function wordsOf(source: string, firstIndex: number): { words: SpeakableWord[]; gaps: SpokenBlock["gaps"] } {
  const words: SpeakableWord[] = [];
  const gaps: SpokenBlock["gaps"] = [];
  let parts: WordPart[] = [];
  let say = "";
  let index = firstIndex;
  const end = () => {
    if (!parts.length) return;
    if (words.length) {
      const before = words[words.length - 1].parts.at(-1)!;
      gaps.push({ bold: before.bold && parts[0].bold, italic: before.italic && parts[0].italic });
    }
    const said = say.replace(/\s+/g, " ").trim();
    const span = said ? said.split(" ").length : 0;
    words.push({ text: parts.map((p) => p.text).join(""), say: said, index, span, bold: parts.some((p) => p.bold), parts });
    index += span;
    parts = [];
    say = "";
  };
  for (const piece of pieces(source)) {
    const mark = { bold: piece.bold, italic: piece.italic, code: piece.code };
    if (piece.code) {
      parts.push({ text: piece.text, ...mark });
      // Punctuation it touches stays against it: "(rev x's)," is said in one breath.
      const said = piece.say ?? "";
      say += /^[\p{L}\p{N}]/u.test(said) && /[\p{L}\p{N}]$/u.test(say) ? ` ${said}` : said;
      continue;
    }
    for (const run of piece.text.split(/(\s+)/)) {
      if (!run) continue;
      if (/^\s+$/.test(run)) end();
      else {
        parts.push({ text: run, ...mark });
        const said = sayText(run).text;
        say += /^[\p{L}\p{N}]/u.test(said) && /[\p{L}\p{N}]$/u.test(say) ? ` ${said}` : said;
      }
    }
  }
  end();
  return { words, gaps };
}

const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
const isNumber = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isFence = (l: string) => /^```/.test(l);
/** A code block ends at a line of at least as many backticks as opened it and nothing else (as markdown.tsx and the loader read it). */
const closes = (l: string, opener: string) => new RegExp(`^\`{${/^`+/.exec(opener)![0].length},}[ \\t]*$`).test(l);

/** What a fence's opening line gives to be said in place of its code: ```lean say: The same proof, typed. */
export function fenceSummary(opener: string): string {
  return /^`+[^`]*?\bsay: ?(.*)$/.exec(opener)?.[1].trim() ?? "";
}

/** The source split into blocks, each still raw markdown. The one place
 *  here that walks the block grammar; keep it in step with markdown.tsx's
 *  Markdown(). */
function segmentBlocks(source: string): { kind: SpokenBlock["kind"]; raw: string; list?: number; say?: string }[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const segments: { kind: SpokenBlock["kind"]; raw: string; list?: number; say?: string }[] = [];
  let i = 0;
  let lists = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (isFence(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !closes(lines[i], line)) buf.push(lines[i++]);
      i++;
      const say = fenceSummary(line);
      segments.push({ kind: "code", raw: buf.join("\n"), ...(say ? { say } : {}) });
    } else if (/^###\s+/.test(line)) {
      segments.push({ kind: "h3", raw: line.replace(/^###\s+/, "") });
      i++;
    } else if (/^#{1,2}\s+/.test(line)) {
      segments.push({ kind: "h2", raw: line.replace(/^#{1,2}\s+/, "") });
      i++;
    } else if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      segments.push({ kind: "quote", raw: buf.join(" ") });
    } else if (isBullet(line) || isNumber(line)) {
      const ordered = isNumber(line);
      const kind: SpokenBlock["kind"] = ordered ? "number" : "bullet";
      let items = 0;
      const list = lists++;
      while (i < lines.length && (ordered ? isNumber(lines[i]) : isBullet(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items > 0))) {
        if (/^\s{2,}\S/.test(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])) segments[segments.length - 1].raw += ` ${lines[i].trim()}`;
        else {
          segments.push({ kind, list, raw: lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, "") });
          items++;
        }
        i++;
      }
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?|```)/.test(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])) buf.push(lines[i++].trim());
      segments.push({ kind: "p", raw: buf.join(" ") });
    }
  }
  return segments;
}

/** The blocks of a passage, each with its words and what is said for them,
 *  the spoken words numbered through the passage: what the page needs to
 *  show the same blocks with a highlight that follows the SpokenWord[] the
 *  server returns for this passage's text. */
export function spokenBlocks(source: string): SpokenBlock[] {
  const out: SpokenBlock[] = [];
  let index = 0;
  for (const { kind, raw, list, say } of segmentBlocks(source)) {
    if (kind === "code") {
      const span = say ? say.split(/\s+/).length : 0;
      const words: SpeakableWord[] = say ? [{ text: raw, say: say.split(/\s+/).join(" "), index, span, bold: false, parts: [{ text: raw, bold: false, italic: false, code: true }] }] : [];
      index += span;
      out.push({ kind, words, gaps: [], code: raw });
      continue;
    }
    const { words, gaps } = wordsOf(raw, index);
    if (!words.length) continue;
    // A heading, a list item or a line that ends without a stop gets one, so
    // the voice does not run it into what follows.
    const last = words.findLast((w) => w.span > 0);
    if (last && /[\p{L}\p{N})\]"”’]$/u.test(last.say)) last.say += ".";
    index = words[words.length - 1].index + words[words.length - 1].span;
    out.push({ kind, words, gaps, ...(list === undefined ? {} : { list }) });
  }
  return out;
}

/** One passage of markdown as the plain text to speak, and which ranges of
 *  it are key terms. Everything said is joined with single spaces, so its
 *  words are the spoken words spokenBlocks numbers. */
export function speakableText(source: string): Speakable {
  let text = "";
  const boldRanges: Range[] = [];
  for (const block of spokenBlocks(source)) {
    for (const w of block.words) {
      if (!w.say) continue;
      const start = text.length + (text ? 1 : 0);
      text += (text ? " " : "") + w.say;
      if (w.bold) {
        const last = boldRanges[boldRanges.length - 1];
        // Bold words side by side are one term.
        if (last && last[1] + 1 === start) last[1] = text.length;
        else boldRanges.push([start, text.length]);
      }
    }
  }
  return { text, boldRanges };
}

/** The word of the page that spoken word `spoken` belongs to, or null. */
export function isSounding(word: SpeakableWord, spoken: number | null | undefined): boolean {
  return spoken !== null && spoken !== undefined && spoken >= word.index && spoken < word.index + word.span;
}

/** The `code` spans of a passage that want a written spoken form: none was
 *  written and the tables are not sure of them. Each once, in order. */
export function spokenGaps(source: string): SpokenGap[] {
  const seen = new Set<string>();
  const out: SpokenGap[] = [];
  for (const { kind, raw } of segmentBlocks(source)) {
    if (kind === "code") continue;
    for (const piece of pieces(raw)) {
      if (!piece.unsure || seen.has(piece.text)) continue;
      seen.add(piece.text);
      out.push({ code: piece.text, said: piece.say ?? "" });
    }
  }
  return out;
}

/** The characters of running text that no table knows how to say. */
export function unsaidSymbols(source: string): string[] {
  const out = new Set<string>();
  for (const { kind, raw } of segmentBlocks(source)) {
    if (kind === "code") continue;
    for (const piece of pieces(raw)) if (!piece.code) for (const run of piece.text.split(/\s+/)) for (const ch of sayText(run).unknown) out.add(ch);
  }
  return [...out];
}
