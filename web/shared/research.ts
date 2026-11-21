// Research maps (Field notes): the Tutor's plain-language account of a
// result in the news, made from the web and saved with its sources and the
// date. Pure: the shape of a map, the Tutor's JSON read into one and held to
// the rules, and the path's concepts the Tutor may link to.
//
// The rules, enforced here rather than trusted to the prompt:
//   - every claim carries at least one source the map lists, with an http(s)
//     link; a claim without one is not shown as a claim but moved to "could
//     not confirm";
//   - what was claimed and what was formally verified are separate lists,
//     and a verified item names the system it was checked in (Lean, Coq,
//     Isabelle…), or it too is moved to "could not confirm";
//   - a concept link names a concept of the path: one a lesson teaches
//     (linked to that lesson) or one an outlined level plans ("outlined, not
//     yet written"); any other is dropped;
//   - a map with no sources at all is refused.
// The app ships no claims of its own about any result: everything a map
// says is the Tutor's, made at the time, from what it read.

import type { Content } from "./content.ts";

export interface ResearchSource {
  /** Its number in the map; claims cite it by this. */
  n: number;
  title: string;
  url: string;
  /** Who published it, and when, as the page says. */
  publisher: string;
  date: string;
  /** Whether the link opened when the map was made (null: not known). */
  reachable: boolean | null;
  /** Its host is on this machine or a private network: never fetched, and backs nothing. */
  private?: true;
}

export interface ResearchClaim {
  text: string;
  /** Numbers of the sources that say it. */
  sources: number[];
}

export interface VerifiedClaim extends ResearchClaim {
  /** The system it was checked in: Lean 4 with Mathlib, Coq, Isabelle… */
  system: string;
}

export type ConceptLink =
  | { kind: "lesson"; concept: string; why: string; lessonId: string; title: string }
  | { kind: "outline"; concept: string; why: string; level: number; title: string };

/** A map as made: everything but its id and date, which the database gives. */
export interface ResearchMapBody {
  question: string;
  title: string;
  /** Two or three sentences: the result, in plain words. The Tutor's own, unsourced: shown as such. */
  summary: string;
  /** What was claimed, by whom and when. */
  claimed: ResearchClaim[];
  /** What was formally verified, and in which system. */
  verified: VerifiedClaim[];
  /** With verified items: the Tutor's note on how far they go. Without: NOTHING_VERIFIED. */
  verifiedNote: string;
  /** The concepts of the path it rests on. */
  concepts: ConceptLink[];
  /** What is still open or disputed. */
  open: ResearchClaim[];
  /** What the Tutor could not confirm, said as such. */
  unconfirmed: string[];
  sources: ResearchSource[];
}

export interface ResearchMap extends ResearchMapBody {
  id: number;
  /** When it was made (ISO). */
  madeAt: string;
}

/** One concept the Tutor may link to, and where it lives in the path. */
export interface PathConcept {
  id: string;
  title: string;
  where: { kind: "lesson"; lessonId: string; title: string } | { kind: "outline"; level: number };
}

/** Every concept of the path: those a lesson teaches (the first lesson
 *  listing it), then those an outlined level plans and no lesson teaches. */
export function pathConcepts(content: Pick<Content, "lessons" | "levels">): PathConcept[] {
  const out = new Map<string, PathConcept>();
  const declared = new Map(content.levels.flatMap((l) => l.concepts.map((c) => [c.id, { title: c.title, level: l.id }] as const)));
  for (const lesson of content.lessons)
    for (const c of lesson.concepts)
      if (!out.has(c)) out.set(c, { id: c, title: declared.get(c)?.title ?? lesson.title, where: { kind: "lesson", lessonId: lesson.id, title: lesson.title } });
  for (const [id, d] of declared) if (!out.has(id)) out.set(id, { id, title: d.title, where: { kind: "outline", level: d.level } });
  return [...out.values()];
}

const MAX_TEXT = 1200;
/** A `system` that names none: the item is not shown as verified. */
const NO_SYSTEM = /^(none|no|n\/?a|unknown|unclear|unspecified|nothing|not .*|un.*verified|[-–—?]+)$/i;
/** What the map says when nothing was shown verified: fixed, never the Tutor's words, so no unsourced claim of verification can sit there. */
export const NOTHING_VERIFIED = "No formal verification was found in the sources cited.";
const MAX_ITEMS = 30;

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = MAX_TEXT): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);

/** The last fenced ```json block of a reply, parsed; null when there is none or it is not JSON. */
export function jsonBlock(reply: string): unknown {
  const blocks = [...reply.matchAll(/```json[ \t]*\n([\s\S]*?)\n```/g)];
  const last = blocks.at(-1);
  if (!last) return null;
  try {
    return JSON.parse(last[1]);
  } catch {
    return null;
  }
}

/** A link a learner may follow: http or https, nothing else. */
export function safeUrl(v: unknown): string {
  const s = text(v, 2000);
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/**
 * The Tutor's reply read into a map, held to the rules above, or the reason
 * it cannot be one. `question` is the learner's, kept as asked.
 */
export function readMap(reply: string, question: string, content: Pick<Content, "lessons" | "levels">): { map: ResearchMapBody } | { error: string } {
  const raw = jsonBlock(reply);
  if (!isRecord(raw)) return { error: "The Tutor's reply had no map in it (a ```json block), so nothing was saved." };
  const sources: ResearchSource[] = [];
  const renumber = new Map<number, number>();
  for (const s of list(raw.sources)) {
    if (!isRecord(s)) continue;
    const url = safeUrl(s.url);
    const n = typeof s.n === "number" && Number.isInteger(s.n) ? s.n : NaN;
    if (!url || Number.isNaN(n) || renumber.has(n)) continue;
    const same = sources.find((x) => x.url === url);
    if (same) {
      renumber.set(n, same.n);
      continue;
    }
    const at = sources.length + 1;
    renumber.set(n, at);
    sources.push({ n: at, title: text(s.title, 300) || url, url, publisher: text(s.publisher, 200), date: text(s.date, 60), reachable: null });
  }
  if (!sources.length) return { error: "The Tutor's map cited no sources it could link to, so it was not saved: a map without sources would be claims with nothing behind them." };

  const unconfirmed = list(raw.unconfirmed).map((u) => text(u)).filter(Boolean);
  const cited = (c: Raw): number[] => [...new Set(list(c.sources).flatMap((n) => (typeof n === "number" && renumber.has(n) ? [renumber.get(n)!] : [])))];
  const claims = (v: unknown, what: string): ResearchClaim[] =>
    list(v).flatMap((c) => {
      if (!isRecord(c) || !text(c.text)) return [];
      const sources = cited(c);
      if (!sources.length) {
        unconfirmed.push(`${what}, with no source given: ${text(c.text)}`);
        return [];
      }
      return [{ text: text(c.text), sources }];
    });
  const claimed = claims(raw.claimed, "Claimed");
  const open = claims(raw.open, "Said to be open or disputed");
  const verified: VerifiedClaim[] = list(raw.verified).flatMap((c) => {
    if (!isRecord(c) || !text(c.text)) return [];
    const sources = cited(c);
    const system = text(c.system, 120);
    if (!sources.length || !system || NO_SYSTEM.test(system)) {
      unconfirmed.push(`Said to be formally verified, but ${!sources.length ? "with no source given" : "without naming the system it was checked in"}: ${text(c.text)}`);
      return [];
    }
    return [{ text: text(c.text), sources, system }];
  });

  const known = new Map(pathConcepts(content).map((c) => [c.id, c]));
  const seen = new Set<string>();
  const concepts: ConceptLink[] = list(raw.concepts).flatMap((c): ConceptLink[] => {
    const id = isRecord(c) ? text(c.id, 80) : "";
    const found = known.get(id);
    if (!found || seen.has(id)) return [];
    seen.add(id);
    const why = isRecord(c) ? text(c.why, 400) : "";
    return found.where.kind === "lesson"
      ? [{ kind: "lesson", concept: id, why, lessonId: found.where.lessonId, title: found.where.title }]
      : [{ kind: "outline", concept: id, why, level: found.where.level, title: found.title }];
  });

  // With verified items the Tutor's note qualifies them (shown as its words); without, the fixed sentence.
  const verifiedNote = verified.length ? text(raw.verifiedNote) : NOTHING_VERIFIED;
  return {
    map: {
      question: question.trim().slice(0, MAX_TEXT),
      title: text(raw.title, 200) || question.trim().slice(0, 200),
      summary: text(raw.summary),
      claimed,
      verified,
      verifiedNote,
      concepts,
      open,
      unconfirmed: unconfirmed.slice(0, MAX_ITEMS * 2),
      sources,
    },
  };
}

/** The format the Tutor is asked to end its reply with, shown to it word for word. */
export const MAP_FORMAT = `{
  "title": "a short name for the result",
  "summary": "two or three plain sentences: what the result is",
  "claimed": [{ "text": "who claimed what, and when", "sources": [1] }],
  "verified": [{ "text": "what exactly was formally checked", "system": "Lean 4 with Mathlib", "sources": [2] }],
  "verifiedNote": "said plainly: nothing was formally verified, or only this part, or the formal proof's statement differs from the claim in this way",
  "concepts": [{ "id": "a concept id from the list", "why": "how the result rests on it" }],
  "open": [{ "text": "what is still open or disputed, and by whom", "sources": [3] }],
  "unconfirmed": ["something you could not confirm, said as such"],
  "sources": [{ "n": 1, "title": "page title", "url": "https://…", "publisher": "who published it", "date": "its date" }]
}`;

/**
 * After the links were checked: a claimed, verified or open item whose
 * every source did not open is not shown as sourced; it moves to "could
 * not confirm", saying so.
 */
export function settleLinks(map: ResearchMapBody): ResearchMapBody {
  // A link that did not open, or on a private host, backs nothing; one not known (a timeout) still does.
  const dead = new Set(map.sources.filter((s) => s.reachable === false).map((s) => s.n));
  const unconfirmed = [...map.unconfirmed];
  const live = <T extends ResearchClaim>(items: T[], what: string): T[] =>
    items.filter((c) => {
      if (!c.sources.every((n) => dead.has(n))) return true;
      unconfirmed.push(`${what}, but no source for it opened when the map was made: ${c.text}`);
      return false;
    });
  const claimed = live(map.claimed, "Claimed");
  const verified = live(map.verified, "Said to be formally verified");
  const open = live(map.open, "Said to be open or disputed");
  return { ...map, claimed, verified, open, unconfirmed, verifiedNote: verified.length ? map.verifiedNote : NOTHING_VERIFIED };
}
