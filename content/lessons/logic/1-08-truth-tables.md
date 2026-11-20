---
id: logic-1-truth-tables
title: Truth tables and proofs
track: logic
level: 1
order: 8
concepts: [truth-tables]
summary: A truth table checks a statement case by case; a proof argues once for every case. When each is enough, and why a statement about all numbers needs the second.
exercises:
  - id: tollens
    kind: truefalse
    title: Modus tollens
    says: For any statements P and Q, if P implies Q, and Q is not true, then P is not true.
    statement: "(P Q : Prop) : (P → Q) → ¬Q → ¬P"
    truth: true
    why: The truth table has T in every row. Suppose P were true; then Q would be, and Q is not.
    solution: |
      intro hPQ
      intro hnQ
      intro hP
      apply hnQ
      apply hPQ
      exact hP
  - id: converse
    kind: truefalse
    title: The converse
    says: For every natural number n, if n is greater than 2, then n is greater than 5.
    statement: "(n : ℕ) : n > 2 → n > 5"
    truth: false
    why: Its converse, "if n > 5 then n > 2", is true, but this one is not. At n = 3, n is greater than 2 and not greater than 5.
    counterexample: "3"
  - id: neither
    kind: fill
    title: Neither one
    says: Suppose it is not the case that P or Q. Then P is not true, and Q is not true.
    statement: "(P Q : Prop) (h : ¬(P ∨ Q)) : ¬P ∧ ¬Q"
    proof: |
      constructor
      · intro hP
        apply h
        <gap>
        exact hP
      · intro hQ
        apply h
        right
        exact hQ
    options: [left, right, exfalso, intro hQ]
    solution: left
---

Since the start of this level you have proved statements about P and Q without ever knowing whether P or Q is true. There is another way to be sure of such a statement: try every case.

## Every case

P is true or false, and so is Q: four cases in all. A **truth table** has one row for each, and works out the statement in every row, a part at a time. Here is *modus tollens*, the rule behind "Prove a not": if P implies Q, and Q fails, then P fails.

```widget
type: truth-table
formula: "(P → Q) ∧ ¬Q → ¬P"
```

The last column is T in every row, so the statement holds whatever P and Q are. A statement like that is called a **tautology**.

Now the proof of the same statement. It does not go through four cases. It assumes the two facts, supposes P, and reaches a contradiction: one argument, good for all four rows at once.

```exercise
id: tollens
```

## When a table is enough, and when it is not

With P and Q, a table has four rows; with five letters, thirty-two. A table always ends, so for statements made of letters and connectives it settles the question by itself.

A statement about numbers is different. "For every natural number n, …" has a row for 0, a row for 1, a row for 2, and on without end. No table finishes. That is why mathematics needs proofs: one argument that covers infinitely many cases.

One thing still works the same way. A single row with F in it is enough to show a statement is not always true. For a statement about numbers, that row is a **counterexample**.

## An implication and its converse

The **converse** of "if A then B" is "if B then A". Fill in the last column and compare the two: they disagree in two rows.

```widget
type: truth-table
formula: "(P → Q) ↔ (Q → P)"
fill: true
```

So an implication can be true while its converse is false. "If n > 5 then n > 2" is true for every n. Its converse is the claim below. True, or false? If false, give the n where it fails.

```exercise
id: converse
```

## Neither one

The table of "not (P or Q)" and "not P and not Q" agrees in every row. This is one of **De Morgan's laws**:

```widget
type: truth-table
formula: "¬(P ∨ Q) ↔ ¬P ∧ ¬Q"
steps: false
caption: The same value in every row, so the two say the same thing.
```

Here is half of it as a proof, with one step missing. In the first case you have supposed P, and the goal is P ∨ Q. Which move makes it P?

```exercise
id: neither
```

## What you used

- A **truth table** checks a statement in every case; T in every row means it always holds.
- A **proof** argues once, for every case together, so it works even when the cases never end.
- A **counterexample** is one case where a statement fails, enough to show it is not always true.
- The **converse** of an implication is a different statement, and can be false when the implication is true.
