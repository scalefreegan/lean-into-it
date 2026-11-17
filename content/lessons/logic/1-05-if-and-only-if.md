---
id: logic-1-iff
title: If and only if
track: logic
level: 1
order: 5
concepts: [iff]
summary: An if-and-only-if is two if-thens, one in each direction. It is proved and used with moves you already have.
exercises:
  - id: both-ways
    title: Prove both directions
    mode: board
    says: Suppose that if P then Q, and that if Q then P. Then P if and only if Q.
    statement: "(P Q : Prop) (hPQ : P → Q) (hQP : Q → P) : P ↔ Q"
    moves: [constructor, exact]
    solution: |
      constructor
      exact hPQ
      exact hQP
  - id: forwards
    title: Use it forwards
    mode: board
    says: Suppose P if and only if Q, and suppose P. Then Q.
    statement: "(P Q : Prop) (h : P ↔ Q) (hP : P) : Q"
    moves: [apply, exact, obtain]
    solution: |
      obtain ⟨hPQ, hQP⟩ := h
      apply hPQ
      exact hP
  - id: backwards
    title: Use it backwards
    mode: board
    says: Suppose P if and only if Q, and suppose Q. Then P.
    statement: "(P Q : Prop) (h : P ↔ Q) (hQ : Q) : P"
    moves: [apply, exact, obtain]
    solution: |
      obtain ⟨hPQ, hQP⟩ := h
      apply hQP
      exact hQ
  - id: turn-round
    title: Turn it round
    mode: board
    says: Suppose P if and only if Q. Then Q if and only if P.
    statement: "(P Q : Prop) (h : P ↔ Q) : Q ↔ P"
    moves: [apply, exact, constructor, obtain]
    solution: |
      obtain ⟨hPQ, hQP⟩ := h
      constructor
      exact hQP
      exact hPQ
  - id: typed
    title: Now type one
    mode: typed
    says: P and Q, if and only if Q and P.
    statement: "(P Q : Prop) : P ∧ Q ↔ Q ∧ P"
    forbid: [tauto, aesop, simp, simp_all, grind, itauto, exact?, apply?, decide, and_comm, And.comm]
    solution: |
      constructor
      intro h
      obtain ⟨hP, hQ⟩ := h
      constructor
      exact hQ
      exact hP
      intro h
      obtain ⟨hQ, hP⟩ := h
      constructor
      exact hP
      exact hQ
---

"A whole number is even **if and only if** its square is even." The phrase claims two things: if the number is even then so is its square, *and* if the square is even then so is the number. Logicians write `A ↔ B`, and mathematicians often shorten the phrase to *iff*.

So an if-and-only-if is an **and of two if-thens**: `A → B` together with `B → A`. That is all it is, and the moves for *and* handle it.

## Proving one

**constructor** splits the goal `P ↔ Q` into its two directions: first `P → Q`, then `Q → P`. Lean labels them `mp` and `mpr`. The names are old: *mp* is short for *modus ponens*, the forward direction, and the *r* is for *reverse*.

A written proof does the same. It says "(⇒)" and proves one direction, then "(⇐)" and proves the other.

```exercise
id: both-ways
```

## Using one

**obtain** takes `h : P ↔ Q` apart into its two if-thens. Then each is an ordinary if-then, to apply as before. The if-and-only-if itself cannot be applied whole: take it apart first.

```exercise
id: forwards
```

The other direction is there too, when you need it.

```exercise
id: backwards
```

And both skills together:

```exercise
id: turn-round
```

## Typing it yourself

Type `\iff` then a space for `↔`, though here the statement is given and you will not need to. After `constructor` there are two goals, and each begins with an if-then, so each begins with `intro`.

```exercise
id: typed
```

## What you used

- `constructor` to prove `A ↔ B`: two goals, `A → B` then `B → A`.
- `obtain ⟨hAB, hBA⟩ := h` to use `h : A ↔ B`: two if-then facts, one for each direction.
