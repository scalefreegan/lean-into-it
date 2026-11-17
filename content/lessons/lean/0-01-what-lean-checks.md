---
id: lean-0-what-lean-checks
title: What Lean checks
track: lean
level: 0
order: 1
concepts: [checking]
summary: What Lean is, what it means when it accepts a proof, and why stating a claim is not the same as proving it. The move rfl, and how it differs from norm_num.
exercises:
  - id: compute
    title: Two sides that are the same number
    mode: board
    says: "2 + 2 = 4."
    statement: ": 2 + 2 = 4"
    moves: [rfl]
    solution: |
      rfl
  - id: power
    title: A bigger one
    mode: board
    says: "2 to the power 10 is 1024."
    statement: ": 2 ^ 10 = 1024"
    moves: [rfl]
    solution: |
      rfl
  - id: sum
    title: A sum
    mode: board
    says: "The numbers from 1 to 10 add up to 55."
    statement: ": 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 = 55"
    moves: [rfl]
    solution: |
      rfl
  - id: decimals
    title: Where rfl stops
    mode: board
    says: "As real numbers, 2.5 + 2.5 = 5."
    statement: ": (2.5 : ℝ) + 2.5 = 5"
    moves: [rfl, norm_num]
    solution: |
      norm_num
  - id: which-move
    title: Which move?
    mode: board
    says: "Let a and b be whole numbers with a = b. Then a = b."
    statement: "(a b : ℕ) (h : a = b) : a = b"
    moves: [exact, rfl]
    solution: |
      exact h
---

**Lean** is a programming language with one unusual ability: you can write a mathematical statement in it, write a proof of that statement, and have the computer check that the proof is correct. Software that does this is called a *proof assistant*.

The checking is done by a small program at the centre of Lean called the **kernel**. The kernel knows the rules of logic and how to compute, and very little else. It does not judge whether an argument is convincing or elegant. Each move you make adds to a complete, fully detailed proof, and when you finish, the kernel checks that whole proof against the rules.

> When Lean accepts a proof, it means the complete proof was checked against the rules of logic by a program, with nothing skipped. It does not mean somebody read it and agreed.

That is why the proofs in this course are graded by Lean and by nothing else. If the board says there is no goal left, the proof is correct.

## A statement is not a proof

Lean will let you *write down* any statement that makes sense, true or false. Here is Goldbach's conjecture in Lean:

```
∀ n : ℕ, 2 < n → Even n → ∃ p q : ℕ, Nat.Prime p ∧ Nat.Prime q ∧ p + q = n
```

Read aloud: for every natural number n, if 2 < n and n is even, then there are natural numbers p and q, both prime, with p + q = n. You will learn each of those symbols in Level 1.

Lean is happy with that sentence. It is a well-formed claim. Nobody, human or machine, has a proof to put after it. Writing a statement costs nothing. The proof is the work.

## What stands behind a proof

Lean does not make you start from nothing each time. **Mathlib** is a library of mathematics written in Lean by a large community of mathematicians: more than a million lines of definitions and proved theorems, every one checked by the same kernel. When this course uses the real numbers, or says `Nat.Prime`, those come from Mathlib.

## Finishing a goal by computing

In the last lesson a goal was finished by pointing at a fact that said the same thing. Some goals need no fact at all. `2 + 2 = 4` is true because when you work out the left side you get the right side.

The move for that is **rfl**, short for *reflexivity*: a thing is equal to itself. Lean works out both sides from the definitions of `+`, `*` and `^` on whole numbers, and if they come out as the very same number, the equation is proved.

```exercise
id: compute
```

Lean does not tire: a long calculation with whole numbers is as easy for it as a short one.

```exercise
id: power
```

```exercise
id: sum
```

## Two moves that calculate

You have now met two moves that calculate, and they are not the same.

- **rfl** works both sides out by their definitions and needs them to come out identical. It is the simplest reason an equation can be true. It can only do this where there is something to compute: with whole numbers, yes; with real numbers, no, because a real number is not something Lean can work out digit by digit.
- **norm_num** uses facts about numbers that have already been proved. It handles more: real numbers, inequalities such as 3 < 5, and questions such as whether a number is prime.

See it happen. The numbers below are real numbers, which is why they can have a decimal point. Try **rfl** first and read what Lean says, then finish with **norm_num**.

```exercise
id: decimals
```

When a goal is a calculation and **rfl** refuses it, **norm_num** is the move to try.

## Computing is not always enough

Here are two numbers a and b. You are told they are equal. The goal is that they are equal.

**rfl** will not do it: Lean cannot compute a or b, because it does not know which numbers they are. All it has is the fact. Try **rfl** first and read what Lean says, then finish the proof the other way.

```exercise
id: which-move
```

Those are two different reasons for something to be true. `2 + 2 = 4` is true by calculation. `a = b` is true here because it was assumed. A proof has to say which, and Lean checks that the reason given really applies.

## What you used

- `rfl` finishes an equation between whole numbers whose two sides work out to the same thing.
- `exact h` finishes a goal that a fact `h` states.
- `norm_num`, from the first lesson, calculates using proved facts about numbers. It reaches further than `rfl`: real numbers, inequalities, whether a number is prime.
