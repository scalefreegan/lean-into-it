---
id: math-2-strong-induction
title: Leaning on more than one
track: math
level: 2
order: 7
concepts: [strong-induction]
summary: Sometimes the case before is not enough, and the step needs a case further back. Strong induction lets the step use every smaller case.
exercises:
  - id: two-back
    title: Two steps back
    mode: typed
    says: Suppose f(0) = 0 and f(1) = 0, and f(n + 2) = f(n) for every n. Then f(n) = 0 for every n.
    statement: "(f : ℕ → ℕ) (h0 : f 0 = 0) (h1 : f 1 = 0) (hf : ∀ n, f (n + 2) = f n) (n : ℕ) : f n = 0"
    forbid: [simp, simp_all, aesop, grind, tauto, exact?, apply?, decide, omega]
    solution: |
      induction n using Nat.twoStepInduction with
      | zero => exact h0
      | one => exact h1
      | more k ih1 ih2 =>
        rw [hf]
        exact ih1
  - id: all-smaller
    title: Every smaller case
    mode: typed
    says: Suppose that for every n, if P holds for all numbers below n then P holds for n. Then P holds for every n.
    statement: "(P : ℕ → Prop) (h : ∀ n, (∀ m, m < n → P m) → P n) (n : ℕ) : P n"
    forbid: [simp, simp_all, aesop, grind, tauto, exact?, apply?, decide, omega]
    solution: |
      induction n using Nat.strong_induction_on with
      | _ n ih => exact h n ih
---

In an ordinary induction the step from n to n + 1 uses one thing: the statement for n. Sometimes that is the wrong case to lean on.

## When the case before is not enough

Take a rule that reaches **two** steps back: f(n + 2) = f(n). Knowing f(n + 1) tells you nothing about f(n + 2). You need f(n).

The dominoes still fall, if you set them up to match. Prove the statement for 0 **and** for 1. Then prove it for k + 2, assuming it for k and for k + 1. From 0 and 1 you get 2, from 1 and 2 you get 3, and so on.

Lean has this principle in its library under the name `Nat.twoStepInduction`, and `induction … using` lets you choose it:

```lean
induction n using Nat.twoStepInduction with
| zero => …
| one => …
| more k ih1 ih2 => …
```

There are two base cases now. In the last case the goal is about `k + 2`, and you have two induction hypotheses: `ih1` is the statement for `k`, and `ih2` is the statement for `k + 1`. Here you will only need the first.

```exercise
id: two-back
```

## Every smaller case

Why stop at two? The most generous version lets the step use the statement for **every** smaller number.

> **Strong induction.** To prove a statement for every n, prove this one thing: *if it holds for all numbers below n, then it holds for n.*

There is no separate base case. For n = 0 there are no numbers below it, so the assumption gives you nothing, and you have to prove the case for 0 outright. The one thing covers it.

The classic use is: every whole number greater than 1 is divisible by a prime. Take n. If n is prime, it divides itself. If not, n = a × b with both factors smaller than n, and by assumption a has a prime factor, which then divides n. The proof leans on a, and a could be anywhere below n. Ordinary induction, which only offers n − 1, would not help.

In Lean the principle is `Nat.strong_induction_on`:

```lean
induction n using Nat.strong_induction_on with
| _ n ih => …
```

There is one case. In it, `ih` says: for every m, if m < n then the statement holds for m.

The exercise is the principle itself, stated with a fact `h` that does the step. Start the induction as above. Then `h n` needs exactly what `ih` provides.

```exercise
id: all-smaller
```

Strong induction is not a stronger kind of truth. Anything proved by it can be proved by ordinary induction on a cleverer statement, "it holds for all numbers up to n". It is the same dominoes. It only lets you say what you need more directly.

## What you used

- A step may lean on more than the case just before it.
- `induction n using Nat.twoStepInduction with`: two base cases, two induction hypotheses.
- `induction n using Nat.strong_induction_on with`: one case, and the statement for every smaller number.
