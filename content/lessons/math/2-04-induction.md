---
id: math-2-induction
title: Induction
track: math
level: 2
order: 4
concepts: [induction]
summary: How to prove something about every natural number in two steps. Prove it for 0. Then prove that whenever it holds for n it holds for n + 1.
exercises:
  - id: stays-zero
    title: It never changes
    mode: board
    says: Suppose f(0) = 0, and f(k + 1) = f(k) for every k. Then f(n) = 0 for every n.
    statement: "(f : ℕ → ℕ) (h0 : f 0 = 0) (hstep : ∀ k, f (k + 1) = f k) (n : ℕ) : f n = 0"
    moves: [induction, rw, exact]
    solution: |
      induction' n with n ih
      exact h0
      rw [hstep]
      exact ih
  - id: doubles
    title: Two more each time
    mode: board
    says: Suppose f(0) = 0, and f(k + 1) = f(k) + 2 for every k. Then f(n) = 2n for every n.
    statement: "(f : ℕ → ℕ) (h0 : f 0 = 0) (hstep : ∀ k, f (k + 1) = f k + 2) (n : ℕ) : f n = 2 * n"
    moves: [induction, rw, exact, omega]
    solution: |
      induction' n with n ih
      exact h0
      rw [hstep]
      rw [ih]
      omega
  - id: at-least-one
    title: It never drops below 1
    mode: board
    says: Suppose f(0) is at least 1, and f(k + 1) = f(k) + f(k) for every k. Then f(n) is at least 1 for every n.
    statement: "(f : ℕ → ℕ) (h0 : f 0 ≥ 1) (hstep : ∀ k, f (k + 1) = f k + f k) (n : ℕ) : f n ≥ 1"
    moves: [induction, rw, exact, omega]
    solution: |
      induction' n with n ih
      exact h0
      rw [hstep]
      omega
  - id: zero-add
    title: Zero on the other side, properly
    mode: typed
    says: For any natural number n, 0 + n = n.
    statement: "(n : ℕ) : 0 + n = n"
    forbid: [simp, simp_all, omega, zero_add, add_comm, add_eq_right, add_eq_left, ring, ring_nf, linarith, abel, ac_rfl, aesop, grind, tauto, exact?, apply?, decide, norm_num, simpa, hint, rw?, nlinarith, ring1, abel1, abel_nf, ac_nf, noncomm_ring, linear_combination, subst_eqs, positivity, bound, norm_num1]
    solution: |
      induction n with
      | zero => rfl
      | succ k ih => rw [Nat.add_succ, ih]
---

How do you prove something about *every* natural number? You cannot check them one at a time. Level 1 gave one answer, "let n be any number", and it works when the proof never needs to know anything about n. Often it does need to, and then there is a second answer, which uses what the natural numbers are.

## Dominoes

Stand dominoes in a row, one for each number: 0, 1, 2, 3, and on without end. Suppose you know two things.

1. The first domino falls.
2. Whenever a domino falls, it knocks over the next one.

Then every domino falls. Domino 0 falls by the first point. So domino 1 falls, by the second. So domino 2 falls, by the second again. Pick any domino you like: the falling reaches it after that many steps.

> **Proof by induction.** To prove a statement for every natural number n, prove two things. The **base case**: it holds for 0. The **step**: if it holds for n, then it holds for n + 1.

It works because of what a natural number is: zero, or the one after something. The base case covers zero. The step covers "the one after".

In the step you are allowed to *assume* the statement for n. That assumption is called the **induction hypothesis**. It can look like assuming what you are trying to prove. It is not: you assume it for one number n, and prove it for the next one.

## On the board

Click **induction**, then click the number to do induction on. Two goals appear.

- The base case, with 0 in place of n.
- The step, with n + 1 in place of n, and one new fact: `ih`, the induction hypothesis, which is the statement for n.

In this first one, a rule says how f at k + 1 comes from f at k. That is the shape that calls for induction.

```exercise
id: stays-zero
```

Look at what happened in the step. The goal was about `f (n + 1)`. The rule `hstep` rewrote it into a goal about `f n`, and the induction hypothesis is exactly a fact about `f n`. Nearly every induction goes this way: **get the goal into a form where the induction hypothesis applies, then use it.**

The next one ends with some arithmetic. For that there is a new move, **omega**. It finishes goals about whole numbers that need only adding, comparing, and multiplying by particular numbers, and it uses the facts on the board.

```exercise
id: doubles
```

The statement need not be an equation. Here, after rewriting, the induction hypothesis says `f n ≥ 1` and the goal is `f n + f n ≥ 1`. That is plain arithmetic, so `omega` can finish, using `ih` without being told to.

```exercise
id: at-least-one
```

## Typing it yourself

Typed Lean writes an induction with one line for each case:

```lean say: Induction on n, with two cases. The zero case is closed by refl. The successor case, for k with the induction hypothesis I H, is closed by rewriting with h and I H.
induction n with
| zero => rfl
| succ k ih => rw [h, ih]
```

After `| zero =>` comes the proof of the base case. After `| succ k ih =>` comes the proof of the step: `k` is the name for the number, `ih` for the induction hypothesis, and the goal is about `k + 1`. You choose both names. If a case needs more than one line, put the lines underneath it, indented.

The board writes the short form `induction' n with n ih`, which gives the same two goals one after the other. Either is accepted wherever you type.

Now the debt from the last lesson. `0 + n = n` is not true by definition, because addition is defined by what the *second* number is. Induction is on that second number, so in each case Lean can at last see which line of the definition applies. `simp` is switched off here, and so is `Nat.add_comm`, because the proof that a + b = b + a rests on the very fact you are about to prove.

For the step you will need `Nat.add_succ`: a + (b + 1) = (a + b) + 1. After that rewrite Lean shows the left side as `(0 + k).succ`{say: 0 plus k, dot suck}, which is its way of writing "the one after 0 + k". It is the same number as `0 + k + 1`.

```exercise
id: zero-add
```

Induction is not only for numbers. Anything built up from a starting point by a "one more" step can be reasoned about this way. The verified-programs lessons of this level do it for lists, in "Induction on a list".

## What you used

- Induction: prove it for 0, then prove it for n + 1 using it for n.
- `ih`, the induction hypothesis: the statement for n, yours to use in the step.
- `omega` for arithmetic with whole numbers.
- Typed: `induction n with`, then `| zero => …` and `| succ k ih => …`.
