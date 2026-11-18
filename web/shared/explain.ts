// Lean's error messages, said the way a tutor would say them. Only the
// messages the written lessons can produce are covered; anything else is
// shown as Lean wrote it. The original message is always available beside
// the explanation: reading Lean's own words is part of what is being learned.

/** What the board reports, in place of a Lean message, for a move that Lean
 *  accepts but that changes nothing (`norm_num` on a goal it cannot touch). */
export const UNCHANGED = "The move ran without error, and the proof state after it is the same as before it.";

/** What the board reports for `constructor` on a goal that is not an "and"
 *  or an "if and only if". Lean would accept the move on many such goals and
 *  do something the learner has not been taught (on "there exists" it leaves
 *  the witness to be filled in later), so the board does not send it. */
export const NOT_SPLITTABLE = "The goal is not of the form A ∧ B or A ↔ B, so the board did not send this move to Lean.";

/** What the board reports for `use` on a goal that is not a "there exists". */
export const NOT_AN_EXISTS = "The goal is not of the form ∃ x, …, so the board did not send this move to Lean.";

/** What the board reports for `induction` when the goal has nothing to do induction on. */
export const NO_NUMBER = "There is no natural number and no list among this goal's objects, so the board did not send this move to Lean.";

/** A plain sentence for a Lean error, or null when there is none for it. */
export function explain(message: string): string | null {
  const first = message.split("\n")[0];
  let m: RegExpExecArray | null;
  if ((m = /^Tactic `apply` failed: could not unify the conclusion of `([^`]+)`\n\s*(.+)\nwith the goal\n\s*(.+)/.exec(message))) {
    return `${m[1]} ends in “${m[2].trim()}”, but the goal is “${m[3].trim()}”. apply needs a fact whose conclusion is the goal.`;
  }
  if ((m = /^Tactic `apply` failed: could not unify the type of `([^`]+)`\n\s*(.+ ↔ .+)\nwith the goal\n\s*(.+)/.exec(message))) {
    return `${m[1]} says “${m[2].trim()}”, an “if and only if”, which is not the goal “${m[3].trim()}”. Take it apart with obtain first, then apply the direction you need.`;
  }
  if ((m = /^Tactic `apply` failed: could not unify the type of `([^`]+)`\n\s*(.+)\nwith the goal\n\s*(.+)/.exec(message))) {
    return `${m[1]} says “${m[2].trim()}”, which is not the goal “${m[3].trim()}”.`;
  }
  if ((m = /^Type mismatch\n\s*(.+)\nhas type\n\s*(.+)\nof sort `Prop` but is expected to have type\n\s*(.+)\nof sort `Type/.exec(message))) {
    return `${m[1].trim()} is a fact (it says “${m[2].trim()}”), but what is wanted here is a thing of the kind ${m[3].trim()}, such as a number.`;
  }
  if ((m = /^failed to synthesize instance of type class\n\s*(Neg|OfScientific) (\S+)/.exec(message))) {
    return m[1] === "Neg" ? `What is wanted here is one of ${m[2]}, and ${m[2]} has no negative numbers.` : `What is wanted here is one of ${m[2]}, and ${m[2]} has no numbers with a decimal point.`;
  }
  if ((m = /^Type mismatch\n\s*(.+)\nhas type\n\s*(.+)\nbut is expected to have type\n\s*(.+)/i.exec(message))) {
    return `${m[1].trim()} says “${m[2].trim()}”, but the goal is “${m[3].trim()}”. exact needs a fact that says exactly what the goal says.`;
  }
  if ((m = /^Tactic `rfl` failed: The left-hand side\n\s*(.+)\nis not definitionally equal to the right-hand side\n\s*(.+)/.exec(message))) {
    return `Lean cannot work “${m[1].trim()}” and “${m[2].trim()}” out to the same thing. rfl only finishes an equation whose two sides compute to something identical.`;
  }
  if (/^Tactic `rfl` failed: Expected the goal to be a binary relation/.test(first)) {
    return "rfl finishes a goal of the form A = B. This goal is not an equation.";
  }
  if ((m = /^Tactic `rewrite` failed: Did not find an occurrence of the pattern\n\s*(.+)\nin the target expression\n\s*(.+)/.exec(message))) {
    const any = /\?[A-Za-z]/.test(m[1]) ? " (A name with a question mark, like ?k, stands for anything at all.)" : "";
    // Lean's sentence is the same when the pattern is there but under a
    // binder, where `rw` cannot reach: "no f ?x in ∀ x, … f x …" would be false.
    const binder = /^\s*(∀|∃)/.exec(m[2]);
    if (binder) {
      const [word, first] = binder[1] === "∀" ? ["for all", "take that thing first with intro"] : ["there exists", "give that thing first with use"];
      return `rw found no “${m[1].trim()}” it can replace in the goal “${m[2].trim()}”.${any} It cannot replace anything that mentions the thing a “${word}” introduces. If what you want to replace is in there, ${first}, and then rewrite.`;
    }
    return `There is no “${m[1].trim()}” in the goal “${m[2].trim()}” to replace.${any} rw replaces the left side of the equation by its right side, and rw ← the right side by the left.`;
  }
  if ((m = /^Invalid rewrite argument: Expected an equality or iff proof or definition name, but `([^`]+)` is a proof of\n\s*(.+)/.exec(message))) {
    return `${m[1]} says “${m[2].trim()}”, which is not an equation. rw needs a fact of the form a = b.`;
  }
  if (/^omega could not prove the goal:\nNo usable constraints found/.test(message)) {
    return "omega sees no arithmetic to work with here. It does not know what words like Even, Odd or “divides” mean: take such a fact apart with obtain, and give the goal its number with use, first.";
  }
  if (/^omega could not prove the goal/.test(first)) {
    return "omega could not get the goal from the facts on the board. It knows adding, comparing and multiplying by a particular number. It does not multiply two letters, and it does not look inside a function.";
  }
  if ((m = /^Tactic `decide` proved that the proposition\n\s*(.+)\nis false/.exec(message))) {
    return `decide checked it, and “${m[1].trim()}” is false.`;
  }
  if (/^Expected type must not contain free variables/.test(first)) {
    return "decide checks a claim about particular numbers by working it out. This goal has a letter in it, which stands for every number at once, so there is nothing to work out.";
  }
  if (/^Tactic `decide` failed to reduce/.test(first) && /Real\.|Classical\.choice/.test(message)) {
    return "decide checks a claim by computing, and a real number cannot be computed with: it may have infinitely many digits. For arithmetic with particular real numbers, use norm_num.";
  }
  if (/^The `ring` tactic failed to close the goal/.test(first)) {
    return "ring could not prove this. It proves an equation that holds by the rules of algebra alone, whatever the letters stand for. Either the two sides are not equal for every value of the letters, or the equation depends on a fact on the board, which ring does not read: rewrite with that fact first. If a letter is being divided by, clear the fractions with field_simp first.";
  }
  if (/^`?ring_nf`? made no progress/.test(first)) {
    return "ring found nothing to do: it could not prove this, and could not even tidy either side. It proves an equation that holds by the rules of algebra alone, whatever the letters stand for, and this goal is not one of those.";
  }
  if (/^linarith failed to find a contradiction/.test(first)) {
    // To prove A ≤ B, linarith assumes the opposite (Lean shows it as a fact
    // named `a✝`) and looks for a contradiction. With no such fact, the goal
    // was not a comparison and only the facts on the board were tried.
    if (!/^a✝ : /m.test(message)) {
      return "linarith found no comparison to prove in this goal, and the facts on the board do not contradict each other. It proves a goal that compares two expressions, with =, ≤ or <. An “and”, a “there exists” or a “for all” has to be taken apart first, with constructor, use or intro.";
    }
    // `nlinarith` fails with the same message.
    return "The facts on the board, each multiplied by a particular number and added up, do not give the goal. To linarith a product of two letters, such as ab or x², is a single unknown quantity with no connection to the letters in it, and so are |x| and f(x). Check that every fact you need is on the board. nlinarith also tries multiplying pairs of facts together; where that is not enough either, the product or the square that matters has to be stated as a fact of its own.";
  }
  if (/^not a positivity goal/.test(first)) {
    return "positivity proves goals of the form 0 < A, 0 ≤ A or A ≠ 0. This goal does not have that form.";
  }
  if (/^failed to prove positivity/.test(first)) {
    return "positivity could not see this from the way the expression is built. It knows that squares and absolute values are not negative, and that sums and products of positive things are positive, and it looks on the board for a fact saying a letter is positive. It cannot do subtraction: as far as it can tell, x − 1 might be negative. linarith is the move for that.";
  }
  if (/^`?gcongr`? did not make progress/.test(first)) {
    return "gcongr compares two sides that are built the same way, part by part, and here it found no parts it can compare. Either the two sides do not have the same form, or they are built with something it has no rule for, such as a function that is not known to be increasing.";
  }
  if ((m = /^invalid 'calc' step, failed to synthesize `Trans` instance\n\s*Trans (\S+) (\S+)/.exec(message))) {
    const sign: Record<string, string> = { "LE.le": "≤", "LT.lt": "<", "GE.ge": "≥", "GT.gt": ">", Eq: "=", Ne: "≠" };
    const [a, b] = [sign[m[1]], sign[m[2]]];
    const which = a && b ? `a “${a}” link and then a “${b}” link` : "two links";
    return `This chain has ${which}, and Lean knows no way to join those into one statement. Every link of a chain has to point the same way: =, ≤ and < go together, and so do =, ≥ and >. A link that points the other way can be turned round: b ≥ c says the same as c ≤ b.`;
  }
  if ((m = /^'calc' expression has type\n\s*(.+)\nbut is expected to have type\n\s*(.+)/.exec(message))) {
    return `This chain proves “${m[1].trim()}”, but the goal is “${m[2].trim()}”. A chain proves what its links add up to: the first thing compared with the last, with < if any link is strict.`;
  }
  if (/^`?field_simp`? made no progress/.test(first)) {
    return "field_simp found no fraction it could clear. Either there is none, or it does not know that what is divided by is not zero.";
  }
  if (/^`?simp`? made no progress/.test(first)) {
    return "simp found nothing in its library of facts that makes this goal simpler.";
  }
  if (/^Tactic `induction` failed: major premise type is not an inductive type/.test(first)) {
    return "Induction is done on a natural number or on a list. What was picked is neither.";
  }
  if (message === NO_NUMBER) {
    return "Induction is done on a natural number or on a list, and there is neither among the objects of this goal.";
  }
  if (message === NOT_AN_EXISTS) {
    return "use gives the thing for a “there exists” goal, and this goal is not asking for a thing. If you have already given one and it was the wrong one, Undo takes it back.";
  }
  if (message === UNCHANGED) {
    return "Lean accepted it, but it left the facts and the goal exactly as they were.";
  }
  if (/^Tactic `introN?` failed: There are no additional binders/.test(first)) {
    return "There is nothing to assume here: intro only works when the goal is an “if… then”, a “not” or a “for all”.";
  }
  if (/^Tactic `constructor` failed/.test(first) || message === NOT_SPLITTABLE) {
    return "constructor splits a goal of the form “A and B” or “A if and only if B” into its two parts. This goal is not one of those.";
  }
  if ((m = /^Tactic `(left|right)` failed/.exec(first))) {
    return `${m[1]} chooses a side of a goal of the form “A or B”. This goal is not an “or”.`;
  }
  if ((m = /^Tactic `rcases` failed: `(\S+) : ([\s\S]+)` is not an inductive datatype/.exec(message))) {
    // Lean sometimes prints the fact unfolded past recognition, over several lines.
    const says = m[2].includes("\n") || m[2].length > 80 ? "is not a fact with parts to take apart" : `says “${m[2]}”, which has no parts to take apart`;
    return `${m[1]} ${says}. obtain works on an “and”, an “or”, an “if and only if” or a “there exists”.`;
  }
  if (/^Tactic `contradiction` failed/.test(first)) {
    return "Lean cannot see two facts here that flatly contradict each other, such as A and not A.";
  }
  if (/^numerals are data in Lean, but the expected type is a proposition/.test(first)) {
    return "A number was given where Lean expected a proof of a statement. use gives the thing for a “there exists” goal, and this goal is not asking for a thing. If you have already given one and it was the wrong one, Undo takes it back.";
  }
  if ((m = /^Unknown identifier `([^`]+)`/.exec(first))) {
    return `There is no fact or object called ${m[1]} here. Check the names on the cards.`;
  }
  if (/^No goals to be solved/i.test(first)) {
    return "The proof was already finished before this line. Delete it.";
  }
  if (/^unsolved goals/.test(first)) {
    return "Every line is fine so far, but there is still something left to show.";
  }
  if (/^unexpected token '#print'/.test(first) || /^unexpected token '\)'; expected/.test(first)) {
    return "This line is not finished: a bracket is still open, or something is missing at the end.";
  }
  if (/^unknown tactic/i.test(first) || /^unexpected token/.test(first)) {
    return "Lean could not read this line. Check the spelling of the move, and that there is one move per line.";
  }
  return null;
}

/**
 * The line Lean proposes in a "Try this" note, as `exact?` writes one:
 *
 *     Try this:
 *       [apply] exact Nat.le_trans h1 h2
 *
 * or null when the message is not such a note.
 */
export function suggestion(message: string): string | null {
  // `ring` that did not finish says "Try this: ring_nf", which is a remark
  // about the line already written and not a line to use.
  if (/The `ring` tactic failed/.test(message)) return null;
  const m = /^Try this:\s*(?:\[apply\]\s*)?(\S.*)/.exec(message);
  return m ? m[1].trim() : null;
}
