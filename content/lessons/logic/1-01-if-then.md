---
id: logic-1-if-then
title: If… then
track: logic
level: 1
order: 1
concepts: [implication]
summary: How to use a fact of the form "if A then B", and how to prove one. Three moves, intro, apply and exact, are enough.
exercises:
  - id: use-it
    title: Use an if-then
    mode: board
    says: Suppose P is true, and suppose that if P then Q. Then Q is true.
    statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q"
    moves: [apply, exact]
    solution: |
      apply hPQ
      exact hP
  - id: prove-it
    title: Prove an if-then
    mode: board
    says: If P, then P.
    statement: "(P : Prop) : P → P"
    moves: [intro, apply, exact]
    solution: |
      intro hP
      exact hP
  - id: chain
    title: Chain two together
    mode: board
    says: Suppose that if P then Q, and that if Q then R. Then if P then R.
    statement: "(P Q R : Prop) (hPQ : P → Q) (hQR : Q → R) : P → R"
    moves: [intro, apply, exact]
    solution: |
      intro hP
      apply hQR
      apply hPQ
      exact hP
  - id: ignore
    title: An assumption you do not need
    mode: board
    says: If P, then (if Q then P).
    statement: "(P Q : Prop) : P → (Q → P)"
    moves: [intro, apply, exact]
    solution: |
      intro hP
      intro hQ
      exact hP
  - id: typed
    title: Now type one
    mode: typed
    says: Suppose that if P then (if Q then R). Then if (if P then Q), then (if P then R).
    statement: "(P Q R : Prop) (h : P → Q → R) : (P → Q) → P → R"
    forbid: [tauto, aesop, simp, simp_all, grind, itauto, exact?, apply?, decide]
    solution: |
      intro hPQ
      intro hP
      apply h
      exact hP
      apply hPQ
      exact hP
---

Most of mathematics is made of sentences shaped like **if A then B**. If a number is divisible by 4, then it is even. If a function is differentiable, then it is continuous. Logicians write the arrow `A → B` and call it an *implication*.

When is an implication true? Go through every case: A true or false, B true or false. The only way "if A then B" can fail is for A to be true and B false. When A is false, the implication makes no claim at all, so it holds.

```widget
type: truth-table
formula: "P → Q"
steps: false
caption: An implication is false in one row only, where P is true and Q is false.
```

A table like this checks a statement one case at a time. A proof does something else: it argues once, for all the cases together, and that is what the rest of this level is about.

There are only two things you ever do with an implication: you **use** one you already have, or you **prove** a new one. This lesson is those two skills, and the three moves that carry them out.

## The board, again

You know the board from Level 0: the **facts** you have, each with a short name, and below them the **goal**, written after `⊢`. Until now one move finished the proof. From here on a move usually *changes* the board, and a proof takes several.

> A proof is a sequence of moves that turns "here is what I know, here is what I want" into "nothing left to show". Lean checks every move.

## Using an if-then

Say you know `hPQ : P → Q`, and your goal is `Q`. A mathematician would say: *"by hPQ, it is enough to show P."* The goal Q has been traded for the goal P. That is the move **apply**.

Notice the direction. You did not start from P and walk forward to Q. You started from where you want to end up, and stepped **backwards** to something easier. Mathematicians do this constantly, and it is how Lean proofs usually run.

When the goal is word for word one of your facts, the move **exact** finishes it: *"which is exactly hP."*

Try it. Click **apply**, then the fact to apply.

```exercise
id: use-it
```

Each click wrote one line of Lean. Those two lines are the whole proof, exactly as you would type it.

## Proving an if-then

Now the other direction. To **prove** "if A then B" you say: *"assume A."* From then on A is one of your facts, and what remains is to show B. That is the move **intro**: it moves the "if" part up into your facts and gives it a name.

```exercise
id: prove-it
```

## Putting them together

Real proofs mix the two. When the goal is an if-then, intro. When the goal is the end of an if-then you know, apply. When the goal is something you already have, exact.

```exercise
id: chain
```

Read the Lean you just wrote from the bottom up and it is the forward argument: P holds, so Q holds, so R holds. Read it top down and it is how you found it: to get R, enough to get Q; to get Q, enough to get P; and P is what was assumed. The same proof, in two directions.

Here is that proof as a textbook would write it, beside the Lean. Select a sentence to see the lines that say it, or a line to see the board after it.

```widget
type: informal-formal
exercise: chain
steps:
  - "1: Suppose P. We must show R."
  - "2: Since Q implies R, it is enough to show Q."
  - "3: Since P implies Q, it is enough to show P."
  - "4: And P is what we supposed."
caption: Here each sentence is one line of Lean. Later, one sentence will often be several.
```

Sometimes an assumption turns out not to be needed. That is fine: you assumed it, you are not obliged to use it.

```exercise
id: ignore
```

## Typing it yourself

The board was writing Lean for you. Here there is no palette, only an editor. The panel beside it shows the facts and the goal at your cursor, just as the board did, and updates as you type. One move per line.

One new thing: `P → Q → R` means `P → (Q → R)`, "if P, then if Q then R". When you apply a fact like that to the goal R, there are **two** things left to show, first P and then Q, and the panel will show both goals.

```exercise
id: typed
```

## What you used

- `intro h` to prove an if-then: assume the "if" part and name it `h`.
- `apply h` to use an if-then `h` whose conclusion is the goal: the goal becomes what `h` needs.
- `exact h` to finish a goal that is exactly the fact `h`.
