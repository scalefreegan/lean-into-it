---
id: logic-0-facts-and-goal
title: Facts and a goal
track: logic
level: 0
order: 2
concepts: [proof-state]
summary: Every proof in progress has the same shape, what you know and what you want. How to read it on the proof board, and a first proof made with one click.
exercises:
  - id: first
    title: Your first proof
    mode: board
    says: Suppose P is true. Then P is true.
    statement: "(P : Prop) (hP : P) : P"
    moves: [exact]
    solution: |
      exact hP
  - id: pick
    title: Pick the right fact
    mode: board
    says: Suppose P, Q and R are all true. Then Q is true.
    statement: "(P Q R : Prop) (hP : P) (hQ : Q) (hR : R) : Q"
    moves: [exact]
    solution: |
      exact hQ
  - id: about-a-number
    title: A fact about a number
    mode: board
    says: Let n be a whole number that is bigger than 2 and even. Then n is even.
    statement: "(n : ℕ) (hbig : n > 2) (heven : Even n) : Even n"
    moves: [exact]
    solution: |
      exact heven
  - id: about-a-real
    title: A fact about a real number
    mode: board
    says: "Let x be a real number with 0 < x and x < 5. Then 0 < x."
    statement: "(x : ℝ) (hpos : 0 < x) (hsmall : x < 5) : 0 < x"
    moves: [exact]
    solution: |
      exact hpos
---

Open any proof in a textbook and it starts the same way. *"Let n be an even number. Suppose n is bigger than 2. We want to show that…"* First the things being talked about, then what is assumed about them, then what is to be shown.

Lean keeps exactly that list in front of you the whole time. It is called the **proof state**, and the proof board draws it as cards.

## The three kinds of card

- **About** (grey): the things the proof talks about. `n : ℕ` is read "n is a natural number", that is, one of 0, 1, 2, 3 and so on. `x : ℝ` is "x is a real number". `P : Prop` is "P is a statement", one that might be true or false.
- **Facts you have** (teal): what is known or assumed. Each fact has a short name in front of it, so that you can point at it. `heven : Even n` is a fact, named `heven`, which says that n is even.
- **Goal** (amber): the one statement still to be shown. Lean writes it after the symbol `⊢`.

The names of facts usually start with `h`, for *hypothesis*. The name is only a label. What matters is what the fact says.

## Finishing a proof

A proof is finished when there is no goal left. The simplest way that can happen: the goal says exactly what one of your facts says. Then you point at that fact and you are done. A mathematician would write *"which is what we assumed"*.

The move for that is **exact**. Click **exact**, then click the fact.

```exercise
id: first
```

That was a complete proof, checked by Lean. It is not a deep one. But look at the part of the board headed **Lean written so far**. Its first line, beginning `example`, is the claim in Lean's own language: `example … := by`{say: example, dot dot dot, colon equals by} reads "here is a claim, and it is proved by the following". Under it is the line your click wrote, `exact hP`. That one line is the proof, the same line you would type.

## The fact has to match

With more facts on the board you have to choose. Only a fact that says exactly what the goal says will do. Try the wrong one first and see what Lean tells you.

```exercise
id: pick
```

Lean did not guess what you meant, and it did not let a near miss through. That strictness is the whole point of it. It is what makes "Lean accepts this proof" mean something.

## Facts about numbers

Nothing changes when the statements are about numbers. Read the board the way the textbook sentence reads: n is a natural number, it is bigger than 2, it is even. The goal is that n is even.

```exercise
id: about-a-number
```

Notice that the fact `hbig` was never used. That is allowed. You are told more than you need all the time.

```exercise
id: about-a-real
```

## What you used

- The proof state: the things being talked about, the facts you have, and the goal.
- `exact h` finishes the goal when the fact `h` says exactly what the goal says.

In this lesson the goal was always sitting among the facts. From Level 1 on it usually will not be, and the moves you learn will each change the board, a step at a time, until it is.
