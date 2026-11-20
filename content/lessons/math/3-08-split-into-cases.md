---
id: math-3-cases
title: Split into cases
track: math
level: 3
order: 8
craft: true
concepts: [or]
summary: When a fact will not come in one piece, cut the problem into cases that together cover everything, and prove each one on its own. How to choose the split, and how to be sure no case is missing.
exercises:
  - id: product-even
    title: n times n + 1
    mode: typed
    concept: divisibility
    says: For every natural number n, n(n + 1) is even.
    statement: "(n : ℕ) : Even (n * (n + 1))"
    forbid: [grind, aesop, decide, exact?, apply?, hint, simp, simp_all, omega, tauto, norm_num, Nat.even_mul_succ_self, Nat.even_mul_self_add_one, Nat.even_mul, Nat.even_add_one]
    solution: |
      obtain ⟨k, hk⟩ | ⟨k, hk⟩ := Nat.even_or_odd n
      use k * (k + k + 1)
      rw [hk]
      ring
      use (2 * k + 1) * (k + 1)
      rw [hk]
      ring
  - id: choose-split
    kind: fill
    title: Choose the split
    concept: absolute-value
    says: For any real number x, x ≤ |x|.
    statement: "(x : ℝ) : x ≤ |x|"
    proof: |
      obtain h | h := <gap>
      rw [abs_of_nonneg h]
      rw [abs_of_neg h]
      linarith
    options: [le_or_gt 0 x, le_or_gt x 0, lt_or_ge 0 x, le_total 0 x]
    solution: le_or_gt 0 x
  - id: forgotten-case
    kind: flaw
    title: Which case is missing
    says: A proof that x² > x for every real number x.
    steps:
      - Let x be a real number. We show that x² > x.
      - "Case x > 1: multiplying x > 1 by the positive number x gives x · x > x · 1, so x² > x."
      - "Case x < 0: a square is never negative, so x² ≥ 0 > x."
      - Every real number is either greater than 1 or less than 0, so these two cases are all there is.
      - So in every case x² > x.
    flaw: 4
    why: Between 0 and 1 (and at 0 and 1 themselves) a number is neither. The cases do not cover everything, and the claim is false there. At x = 1/2, x² is 1/4, which is less than x.
  - id: square-positive
    title: Not zero, so positive
    mode: typed
    concept: absolute-value
    says: For any real number x that is not 0, 0 < x².
    statement: "(x : ℝ) (h : x ≠ 0) : 0 < x ^ 2"
    forbid: [grind, bound, aesop, positivity, exact?, apply?, hint, simp, pow_pos, sq_pos_of_ne_zero, sq_pos_of_pos, sq_pos_of_neg, sq_pos_iff, pow_pos_iff, sq_pos', sq_pos, Even.pow_pos, mul_self_pos, pow_ne_zero, lt_of_le_of_ne]
    solution: |
      obtain h1 | h1 := lt_or_gt_of_ne h
      nlinarith
      nlinarith
---

Some facts will not come in one piece. "n(n + 1) is even" is true for every natural number n, and no single calculation covers all of them at once: the reason depends on what kind of number n is.

When that happens, a mathematician does what a doctor does with a long list of symptoms: sorts the possibilities into **cases**, deals with each, and makes sure that every possibility lands in some case. This lesson is that habit.

## A worked problem

> For every natural number n, n(n + 1) is even.

Try some. 1 · 2 = 2. 2 · 3 = 6. 3 · 4 = 12. Always even. Why? Because n and n + 1 are neighbours, and of two neighbours one is even. That sentence is the proof, in outline. Cases make it exact.

Every natural number is even or odd. Say so, and split:

- **Case 1: n is even.** Then n = 2k for some k. So n(n + 1) = 2k(2k + 1), which is 2 times something.
- **Case 2: n is odd.** Then n = 2k + 1. So n + 1 = 2k + 2 = 2(k + 1), and n(n + 1) = (2k + 1) · 2(k + 1), which is 2 times something.

Notice what each case is. It is **its own small proof**, with its own extra fact (n is even; n is odd) that you did not have before. In each case the goal is the same one, and the new fact is what makes it easy.

## The same in Lean

In Lean the split is `obtain`, the move you met in Level 1 for taking apart an "or". Given a fact of the form "A or B", `obtain h | h := fact` makes two goals, one where you have A and one where you have B.

The fact to split on comes from the library: `Nat.even_or_odd n` says "n is even or n is odd".

```lean say: Nat even or odd n says: n is even, or n is odd.
Nat.even_or_odd n : Even n ∨ Odd n
```

An even number is one of the form k + k, and an odd one is 2k + 1. The `obtain` below names the k in each case, and the fact `hk` that says what n is. The two cases then come one after the other, each to be finished before the next.

```exercise
id: product-even
```

The shape of every proof by cases is the same:

1. **Choose what to split on.** A fact "A or B" that you have, or one that the library has.
2. **Check the cases cover everything.** The fact is *A or B*, so there is no third possibility. This is where proofs by cases go wrong.
3. **Prove the goal once for each case,** using what the case tells you.

## Choosing the split

What should you split on? Look at what makes the goal hard.

- If the goal has a division or a remainder in it, split on the remainder: n is even or odd, or n leaves remainder 0, 1 or 2 on division by 3.
- If it has an absolute value |x|, the definition changes with the sign, so split on the sign of x: `0 ≤ x` or `x < 0`.
- If it has a `max`, `min` or an `if`, split on which of the two arguments wins.

The cases should be exactly the ones that make the difficulty go away. With |x| the split is on the sign of x, because the rules `abs_of_nonneg` and `abs_of_neg` each need one sign:

```lean say: abs of nonneg says: if 0 is at most a, then the absolute value of a is a. And abs of neg says: if a is less than 0, then the absolute value of a is minus a.
abs_of_nonneg : 0 ≤ a → |a| = a
abs_of_neg : a < 0 → |a| = -a
```

A split on the sign of x needs a fact that says "0 ≤ x or x < 0", and the library has several facts that look nearly the same. They differ in which side, if either, gets the strict inequality, and in which order the two cases come. Here the proof is written out and the split is left for you. Only one of the choices gives cases that the rest of the proof can use.

```exercise
id: choose-split
```

The library's `le_or_gt 0 x` is "0 ≤ x or 0 > x" (that is, x < 0). The others fail because their cases do not match what the next lines need. That is the real test of a split: not that it is true, but that each of its cases is one you can finish.

## Every case must be covered

A split is only as good as its covering. "x > 1 or x < 0" is a perfectly true statement about some numbers, and a perfectly bad split of the real line: the numbers from 0 to 1 are in neither case, and an argument by those two cases proves nothing about them.

The mistake is hard to see in a written proof, because each case, taken alone, is correct. Here is one with the mistake in it.

```exercise
id: forgotten-case
```

Lean cannot make that mistake. `obtain` can only split a fact "A or B" that you actually have, and to have it you must have proved it, or found it in the library. If your cases do not cover everything, you cannot get the "or", and the proof will not start.

## Cases inside cases

Sometimes the cases themselves have a hard part. That is fine: a case is a proof, and may split again. To show 0 < x² when x is not 0, split on the sign of x. If x < 0 you have a fact `h1 : x < 0`; if x > 0 you have `h1 : x > 0`. In each, a product of two numbers with known signs is something `nlinarith` can see.

The library's `lt_or_gt_of_ne` turns "x ≠ 0" into the two cases at once:

```lean say: lt or gt of ne says: if a is not equal to b, then a is less than b, or a is greater than b.
lt_or_gt_of_ne : a ≠ b → a < b ∨ a > b
```

```exercise
id: square-positive
```

## What you used

- `obtain h1 | h2 := h` splits a fact "A or B" into two goals, one with A and one with B.
- Choose the split by what makes the goal hard: parity for even and odd, the sign for |x|.
- Each case is its own proof; together the cases must cover every possibility.
- Facts to split on: `Nat.even_or_odd`, `le_or_gt`, `lt_or_gt_of_ne`.
