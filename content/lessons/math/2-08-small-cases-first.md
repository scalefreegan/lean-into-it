---
id: math-2-small-cases
title: Small cases first
track: math
level: 2
order: 5.5
craft: true
concepts: [induction, sums]
summary: Before proving a pattern, find it. Try small cases, guess, say the guess exactly, then prove it. Worked on 1 + 2 + 4 + … + 2^k, with a warning about patterns that stop.
exercises:
  - id: three-cases
    title: One more case
    mode: board
    says: 1 + 2 + 4 + 8 = 15.
    statement: ": ∑ i ∈ Finset.range 4, 2 ^ i = 15"
    moves: [decide]
    solution: |
      decide
  - id: powers-and-squares
    kind: truefalse
    title: A pattern that stops
    says: For every natural number n, 2^n is at least n².
    statement: "(n : ℕ) : 2 ^ n ≥ n ^ 2"
    truth: false
    why: It holds for n = 0, 1 and 2 (1 ≥ 0, 2 ≥ 1, 4 ≥ 4), but at n = 3, 2³ = 8 and 3² = 9. (From n = 4 on it holds again.)
    counterexample: "3"
    close: decide
  - id: minus-one
    kind: truefalse
    title: Subtracting in ℕ
    says: For every natural number n, n − 1 + 1 = n.
    statement: "(n : ℕ) : n - 1 + 1 = n"
    truth: false
    why: In ℕ, 0 − 1 is 0, because there is nothing below 0. So at n = 0 the left side is 0 + 1 = 1, and the right side is 0.
    counterexample: "0"
  - id: powers-of-two
    title: Prove the guess
    mode: typed
    says: For every natural number k, 1 + 2 + 4 + … + 2^k, plus 1, is 2^(k+1).
    statement: "(k : ℕ) : ∑ i ∈ Finset.range (k + 1), 2 ^ i + 1 = 2 ^ (k + 1)"
    forbid: [simp_all, aesop, grind, exact?, apply?, decide, simpa, hint, rw?, nlinarith, ring1, abel1, abel_nf, ac_nf, noncomm_ring, linear_combination, subst_eqs, positivity, bound, norm_num1, omega, norm_num, geom_sum_mul_add, geom_sum_eq, Nat.geomSum_eq, geom_sum_mul]
    solution: |
      induction k with
      | zero => rfl
      | succ k ih =>
        rw [Finset.sum_range_succ, Nat.add_right_comm, ih]
        ring
---

Nobody starts a proof by proving. A mathematician starts by trying a few cases, looking for a pattern, and only then asks whether it holds always. The proof comes last. Without a guess there is nothing to prove.

This lesson follows one problem the whole way: what is 1 + 2 + 4 + 8 + … + 2^k, the sum of the powers of two up to 2^k?

## Step 1: try small cases

Work out the smallest cases by hand, and write them in a column.

- k = 0: the sum is 1.
- k = 1: 1 + 2 = 3.
- k = 2: 1 + 2 + 4 = 7.
- k = 3: 1 + 2 + 4 + 8 = 15.

Lean can check a small case by computing it. This is the job of `decide`, from the first lesson of this level. The sum runs over `Finset.range (k + 1)`, the numbers 0 up to k, so k = 3 is `Finset.range 4`.

```exercise
id: three-cases
```

## Step 2: guess the pattern

1, 3, 7, 15. Each is one less than a power of two: 2 − 1, 4 − 1, 8 − 1, 16 − 1. The sum up to 2^k looks like 2^(k+1) − 1.

That is a **conjecture**: a guess that fits the cases so far. It is not yet a theorem, and the next exercise shows why that difference matters.

## Step 3: be careful what a pattern is worth

Four cases fit. Do they prove it? Try another pattern the same way: compare 2^n with n². At n = 0, 1 and 2 the power of two is at least the square: 1 ≥ 0, 2 ≥ 1, 4 ≥ 4. Is it at least n² for every n?

```exercise
id: powers-and-squares
```

Three cases were not enough. The claim fails at n = 3 and nowhere else: from n = 4 on, 2^n pulls further and further ahead. In Level 0, n² + n + 41 was prime for forty cases in a row before it failed. Small cases can *suggest* a statement and can *refute* one, but they cannot prove it for every n. Only a proof does that. Sometimes the pattern fails: the regions made by joining n points on a circle number 1, 2, 4, 8, 16, and then 31, not 32.

## Step 4: state it exactly

The guess is 2^(k+1) − 1. Before proving it, write it so that Lean means what you mean. A trap sits in the minus sign. On natural numbers, subtraction stops at 0: 3 − 5 is 0 in ℕ, not −2.

```exercise
id: minus-one
```

For this particular guess the minus is harmless, because 2^(k+1) is never smaller than 1. Even so, a proof has to carry that fact around, and in other problems the same minus makes the statement false. The habit is to move it to the other side. "The sum is 2^(k+1) − 1" says the same as "the sum, plus 1, is 2^(k+1)", and this has no subtraction at all:

```lean say: The sum, for i in the range k plus 1, of 2 to the i, plus 1, equals 2 to the k plus 1.
∑ i ∈ Finset.range (k + 1), 2 ^ i + 1 = 2 ^ (k + 1)
```

## Step 5: prove it

Now the guess is a statement worth proving, and for every k it calls for induction.

- **Base case**, k = 0: the sum is just 2^0 = 1, so 1 + 1 = 2^1. This is a plain calculation, and `rfl` does it.
- **Step**: suppose 1 + 2 + … + 2^k, plus 1, is 2^(k+1). The sum up to k + 1 has one more term, 2^(k+1). So the new left side is the old sum, plus 2^(k+1), plus 1. By the hypothesis, the old sum plus 1 is 2^(k+1), so we get 2^(k+1) + 2^(k+1), and that is 2^(k+2).

In Lean the step is the same story as in the lesson on sums. `Finset.sum_range_succ` splits the last term off. `Nat.add_right_comm` swaps the two things added at the end, so that "the old sum, plus 1" sits together. `ih` rewrites that group. What is left, 2^(k+1) + 2^(k+1) = 2^(k+1+1), is algebra, and `ring` finishes it.

```exercise
id: powers-of-two
```

## What you used

The habit, in order: **try small cases, guess, state it exactly, prove it.**

- Small cases can suggest a statement or refute it. They never prove it.
- Say a claim without subtraction on ℕ when you can: move the minus to the other side.
- Once the statement is exact, an induction proves it.
