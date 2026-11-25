// The function-arrows widget's logic (bead lii-53v.7): a function between
// two small finite sets, drawn as arrows, and what it does to them. Pure.

/** At most this many elements on each side. */
export const MAX_ELEMENTS = 7;
/** A name of at most this many characters fits in its circle. */
export const MAX_NAME = 4;

/** A function: for each element of the domain, the index of where it goes. */
export interface Arrows {
  from: string[];
  to: string[];
  map: number[];
}

export function readArrows(p: Record<string, unknown>): Arrows | string {
  const texts = (k: string) => (Array.isArray(p[k]) ? (p[k] as unknown[]).map((x) => String(x).trim()) : []);
  const from = texts("from");
  const to = texts("to");
  for (const [key, xs] of [["from", from], ["to", to]] as const) {
    if (!xs.length) return `\`${key}\` needs at least one element`;
    if (xs.length > MAX_ELEMENTS) return `\`${key}\` has ${xs.length} elements; at most ${MAX_ELEMENTS} fit`;
    const bad = xs.find((x) => !x || x.length > MAX_NAME || /->|→/.test(x));
    if (bad !== undefined) return `\`${key}\`: “${bad}” is not a short name (at most ${MAX_NAME} characters, no arrow in it)`;
    if (new Set(xs).size !== xs.length) return `\`${key}\` lists an element twice`;
  }
  const map: number[] = from.map(() => -1);
  for (const a of texts("arrows")) {
    const m = a.split(/\s*(?:->|→)\s*/);
    if (m.length !== 2) return `\`arrows\`: “${a}” is not of the form "1 -> a"`;
    const i = from.indexOf(m[0]);
    const j = to.indexOf(m[1]);
    if (i < 0) return `\`arrows\`: ${m[0]} is not in \`from\``;
    if (j < 0) return `\`arrows\`: ${m[1]} is not in \`to\``;
    if (map[i] >= 0) return `\`arrows\`: ${m[0]} has two arrows, and a function sends each element to one`;
    map[i] = j;
  }
  const lost = map.indexOf(-1);
  if (lost >= 0) return `\`arrows\`: ${from[lost]} has no arrow, and a function sends every element somewhere`;
  for (const [key, side] of [["image", from], ["preimage", to]] as const) {
    const xs = texts(key);
    const bad = xs.find((x) => !side.includes(x));
    if (bad !== undefined) return `\`${key}\`: ${bad} is not in \`${key === "image" ? "from" : "to"}\``;
    if (new Set(xs).size !== xs.length) return `\`${key}\` lists an element twice`;
  }
  return { from, to, map };
}

/** The elements of `to` that more than one arrow reaches: where injectivity fails. */
export function collisions({ to, map }: Arrows): number[] {
  return to.flatMap((_, j) => (map.filter((m) => m === j).length > 1 ? [j] : []));
}
/** The elements of `to` no arrow reaches: where surjectivity fails. */
export function missed({ to, map }: Arrows): number[] {
  return to.flatMap((_, j) => (map.includes(j) ? [] : [j]));
}
/** f '' S: where the elements of S go. */
export function image({ to, map }: Arrows, s: ReadonlySet<number>): number[] {
  return to.flatMap((_, j) => (map.some((m, i) => m === j && s.has(i)) ? [j] : []));
}
/** f ⁻¹' T: the elements that land in T. */
export function preimage({ map }: Arrows, t: ReadonlySet<number>): number[] {
  return map.flatMap((m, i) => (t.has(m) ? [i] : []));
}

const listed = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Why the function is not injective, or that it is. */
export function injectiveSaid(a: Arrows): { holds: boolean; why: string } {
  const hit = collisions(a);
  if (!hit.length) return { holds: true, why: "no two arrows end at the same place" };
  const j = hit[0];
  return { holds: false, why: `${listed(a.from.filter((_, i) => a.map[i] === j))} all go to ${a.to[j]}`.replace(/^(\S+ and \S+) all/, "$1 both") };
}
export function surjectiveSaid(a: Arrows): { holds: boolean; why: string } {
  const out = missed(a).map((j) => a.to[j]);
  return out.length ? { holds: false, why: `nothing goes to ${out.length < 2 ? out[0] : `${out.slice(0, -1).join(", ")} or ${out[out.length - 1]}`}` } : { holds: true, why: "every element on the right is reached" };
}
/** `{a, b}`, or ∅. */
export const braces = (xs: string[]) => (xs.length ? `{${xs.join(", ")}}` : "∅");
