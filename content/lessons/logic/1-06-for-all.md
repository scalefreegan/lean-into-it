---
id: logic-1-for-all
title: For all
track: logic
level: 1
order: 6
concepts: [forall]
summary: Statements about everything of some kind. To use one, apply it to a particular thing. To prove one, take an arbitrary thing and prove it for that.
exercises:
  - id: one-case
    title: Use it on one case
    mode: board
    says: Suppose f(x) is at least 0 for every real number x. Then f(2) is at least 0.
    statement: "(f : ℝ → ℝ) (hf : ∀ x, f x ≥ 0) : f 2 ≥ 0"
    moves: [apply, exact]
    solution: |
      apply hf
  - id: two-cases
    title: Use it twice
    mode: board
    says: Suppose every natural number has the property P. Then 0 has it and 1 has it.
    statement: "(P : ℕ → Prop) (h : ∀ n, P n) : P 0 ∧ P 1"
    moves: [apply, exact, constructor]
    solution: |
      constructor
      apply h
      apply h
  - id: arbitrary
    title: Prove one
    mode: board
    says: Suppose every natural number has the property P, and that every number with P has Q. Then every natural number has Q.
    statement: "(P Q : ℕ → Prop) (hP : ∀ n, P n) (hPQ : ∀ n, P n → Q n) : ∀ n, Q n"
    moves: [intro, apply, exact]
    solution: |
      intro n
      apply hPQ
      apply hP
  - id: never-zero
    title: About a function
    mode: board
    says: Suppose f(x) is greater than 0 for every x, and that wherever f(x) is greater than 0 it is not 0. Then f(x) is not 0 for every x.
    statement: "(f : ℝ → ℝ) (hf : ∀ x, f x > 0) (hg : ∀ x, f x > 0 → f x ≠ 0) : ∀ x, f x ≠ 0"
    moves: [intro, apply, exact]
    solution: |
      intro x
      apply hg
      apply hf
  - id: typed
    title: Now type one
    mode: typed
    says: Suppose every natural number has both P and Q. Then every natural number has Q.
    statement: "(P Q : ℕ → Prop) (h : ∀ n, P n ∧ Q n) : ∀ n, Q n"
    forbid: [tauto, aesop, simp, simp_all, grind, itauto, exact?, apply?, decide]
    solution: |
      intro n
      obtain ⟨hP, hQ⟩ := h n
      exact hQ
---

"**Every** whole number greater than 1 is divisible by some prime." "**For all** real numbers x, x² ≥ 0." Statements about everything of some kind are what mathematics is mostly after, and they are exactly the ones no amount of checking cases can prove. Logicians write `∀ x, …`, read "for all x".

A word on notation first. Lean writes a function applied to a number without brackets: `f 2` is what you would write f(2). And `P n` says "n has the property P": P is a statement with a gap in it, and n fills the gap.

## Using a for-all

A fact `hf : ∀ x, f x ≥ 0` is a promise about every x. To use it you pick the x you care about. In words: *"in particular, f(2) ≥ 0."*

The move is **apply**, the same as for an if-then. Lean compares the fact with the goal and works out for itself that x has to be 2.

```exercise
id: one-case
```

A for-all is not used up. You can take as many particular cases from it as you like.

```exercise
id: two-cases
```

## Proving a for-all

You cannot check every number. What you do is this: *"Let n be any natural number."* Then you prove the statement for that n, using nothing about it except that it is a natural number. Since n could have been any number at all, the proof works for all of them.

The move is **intro**, again the same as for an if-then. It puts a new object n on the board, about which nothing is known, and the goal loses its "for all".

```exercise
id: arbitrary
```

Look at the fact `hPQ : ∀ n, P n → Q n`. It is a for-all with an if-then inside: "for every n, if n has P then n has Q". One **apply** used both layers at once: it picked the n and traded the goal `Q n` for `P n`.

It is no accident that the same two moves serve for-all and if-then. "For all n, Q n" behaves like "if you give me an n, I give you a proof of Q n". The Lean track comes back to this.

```exercise
id: never-zero
```

## Typing it yourself

Typed Lean lets you say which case you want: if `h : ∀ n, P n`, then `h 5` is the fact `P 5`, and `h n` is the fact `P n`. You can use that wherever a fact is expected, for instance `exact h 5`, or `obtain ⟨hP, hQ⟩ := h n` to take a particular case apart.

```exercise
id: typed
```

## What you used

- `intro n` to prove `∀ n, …`: take an arbitrary n.
- `apply h` to use `h : ∀ n, …` when the goal is one of its cases.
- `h 5`, typed: the particular case of `h` at 5.
