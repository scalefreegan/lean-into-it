// Turns the markdown subset lessons are written in (docs/CONTENT.md: ## and
// ### headings, paragraphs, **bold**, *italic*, `code`, lists, > block
// quotes, fenced code) into plain text worth sending to a text-to-speech
// provider, plus enough structure for the page to show the same blocks with
// a word-by-word highlight. A sibling of web/src/markdown.tsx's parsing, not
// a refactor of it: that module makes React nodes; this one makes plain text
// and word ranges, so a lesson, a Tutor reply and an exercise's sentence can
// all go through it. Ported from Fret Not, plus code: a fenced block is
// shown and not read, and `inline code` keeps its look. Pure: no DOM, no
// network.

type Range = [number, number];

export interface Speakable {
  /** The words to send to the provider: markdown syntax stripped out, code blocks left out. */
  text: string;
  /** [start, end) ranges in `text` that were **bold** in the source. */
  boldRanges: Range[];
}

/** One spoken word of a Speakable's `text`, with its global index (the
 *  order the provider's alignment comes back in: both split on the same
 *  whitespace) and how it was marked in the source. */
export interface SpeakableWord {
  text: string;
  index: number;
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
  /** Which `code` span of its block this is in (0, 1, …), so one span is
   *  drawn as one piece even across words; null outside code. */
  code: number | null;
}

/** One block of a passage, in source order. Word indices are global across
 *  the whole passage, the same indices SpokenWord[] (alignment.ts) uses. A
 *  `code` block has no words: it is shown, and the narrator passes over it. */
export interface SpokenBlock {
  kind: "h2" | "h3" | "quote" | "bullet" | "number" | "p" | "code";
  words: SpeakableWord[];
  /** A code block's text, as written. */
  code?: string;
  /** A list item's list (0, 1, … through the passage): items of one list share it. */
  list?: number;
  /** How the space after each word but the last is marked: as both its neighbours are. */
  gaps: Omit<WordPart, "text">[];
}

interface Plain {
  text: string;
  bold: Range[];
  code: Range[];
  italic: Range[];
}

/** Strip `**bold**`, `*italic*` and `` `code` `` from one run of inline
 *  text, returning the plain words and where each kind lands. The token
 *  order matches markdown.tsx's `inline`: code first, so a `*` inside
 *  backticks is not emphasis. */
function inlinePlain(source: string): Plain {
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  const out: Plain = { text: "", bold: [], code: [], italic: [] };
  let last = 0;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (m.index > last) out.text += source.slice(last, m.index);
    const tok = m[0];
    const start = out.text.length;
    if (tok.startsWith("`")) {
      out.text += tok.slice(1, -1);
      out.code.push([start, out.text.length]);
    } else {
      const strong = tok.startsWith("**");
      // Bold and italic can hold markup of their own (markdown.tsx recurses).
      const inner = inlinePlain(strong ? tok.slice(2, -2) : tok.slice(1, -1));
      out.text += inner.text;
      (strong ? out.bold : out.italic).push([start, out.text.length]);
      for (const kind of ["bold", "code", "italic"] as const) for (const [s, e] of inner[kind]) out[kind].push([start + s, start + e]);
    }
    last = m.index + tok.length;
  }
  if (last < source.length) out.text += source.slice(last);
  return out;
}

const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
const isNumber = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isFence = (l: string) => /^```/.test(l);
/** A code block ends at a line of at least as many backticks as opened it and nothing else (as markdown.tsx and the loader read it). */
const closes = (l: string, opener: string) => new RegExp(`^\`{${/^`+/.exec(opener)![0].length},}[ \\t]*$`).test(l);

/** The source split into blocks, each still raw markdown. The one place
 *  here that walks the block grammar; keep it in step with markdown.tsx's
 *  Markdown(). */
function segmentBlocks(source: string): { kind: SpokenBlock["kind"]; raw: string; list?: number }[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const segments: { kind: SpokenBlock["kind"]; raw: string; list?: number }[] = [];
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
      segments.push({ kind: "code", raw: buf.join("\n") });
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

/** One passage of markdown as the plain text to speak, and which ranges of
 *  it were key terms. Blocks are joined with a single space, as they would
 *  be read aloud; code blocks are left out. */
export function speakableText(source: string): Speakable {
  let text = "";
  const boldRanges: Range[] = [];
  for (const { kind, raw } of segmentBlocks(source)) {
    if (kind === "code") continue;
    const plain = inlinePlain(raw);
    if (!plain.text.trim()) continue;
    const base = text.length + (text ? 1 : 0);
    text += (text ? " " : "") + plain.text;
    for (const [s, e] of plain.bold) boldRanges.push([base + s, base + e]);
  }
  return { text, boldRanges };
}

/** Like speakableText, but keeping the blocks and splitting each one's
 *  plain text into words with a running global index: what the page needs
 *  to show the same blocks with a moving highlight that lines up with the
 *  SpokenWord[] the server returns for this passage's text. */
export function spokenBlocks(source: string): SpokenBlock[] {
  const out: SpokenBlock[] = [];
  let index = 0;
  for (const { kind, raw, list } of segmentBlocks(source)) {
    if (kind === "code") {
      out.push({ kind, words: [], gaps: [], code: raw });
      continue;
    }
    const plain = inlinePlain(raw);
    /** How the character at `at` is marked. */
    const markAt = (at: number): Omit<WordPart, "text"> => {
      const within = (ranges: Range[]) => ranges.findIndex(([s, e]) => at >= s && at < e);
      const code = within(plain.code);
      return { bold: within(plain.bold) >= 0, italic: within(plain.italic) >= 0, code: code < 0 ? null : code };
    };
    const same = (a: Omit<WordPart, "text">, b: Omit<WordPart, "text">) => a.bold === b.bold && a.italic === b.italic && a.code === b.code;
    const words: SpeakableWord[] = [];
    const gaps: SpokenBlock["gaps"] = [];
    const re = /\S+/g;
    for (let m = re.exec(plain.text); m; m = re.exec(plain.text)) {
      const parts: WordPart[] = [];
      for (let at = m.index; at < m.index + m[0].length; at++) {
        const mark = markAt(at);
        const last = parts[parts.length - 1];
        if (last && same(last, mark)) last.text += plain.text[at];
        else parts.push({ text: plain.text[at], ...mark });
      }
      if (words.length) {
        // The space before this word is marked as the characters either side of it both are.
        const before = words[words.length - 1].parts.at(-1)!;
        const after = parts[0];
        gaps.push({ bold: before.bold && after.bold, italic: before.italic && after.italic, code: before.code === after.code ? before.code : null });
      }
      words.push({ text: m[0], index: index++, bold: parts.some((p) => p.bold), parts });
    }
    if (words.length) out.push({ kind, words, gaps, ...(list === undefined ? {} : { list }) });
  }
  return out;
}
