---
id: math-2-sums
title: Adding up
track: math
level: 2
order: 5
concepts: [sums]
summary: The formula for 0 + 1 + 2 + … + n, and why the first n odd numbers add up to a square. Both are proved by induction, and written out as a chain of equal things.
exercises:
  - id: a-small-sum
    title: A sum you can check
    mode: board
    says: 0 + 1 + 2 + 3 + 4 = 10.
    statement: ": ∑ i ∈ Finset.range 5, i = 10"
    moves: [decide]
    solution: |
      decide
  - id: chain
    title: A chain of equals
    mode: typed
    says: Suppose a = b + 1 and b = 2c. Then a = 2c + 1.
    statement: "(a b c : ℕ) (h1 : a = b + 1) (h2 : b = 2 * c) : a = 2 * c + 1"
    forbid: [omega, simp, simp_all, linarith, aesop, grind, tauto, exact?, apply?, subst, subst_vars, simpa, hint, rw?, nlinarith, ring1, abel1, abel_nf, ac_nf, noncomm_ring, linear_combination, subst_eqs, positivity, bound, norm_num1]
    solution: |
      calc a = b + 1 := h1
        _ = 2 * c + 1 := by rw [h2]
  - id: gauss
    title: 0 + 1 + … + n
    mode: typed
    says: For every natural number n, twice the sum 0 + 1 + … + n is n(n + 1).
    statement: "(n : ℕ) : 2 * ∑ i ∈ Finset.range (n + 1), i = n * (n + 1)"
    forbid: [simp_all, aesop, grind, exact?, apply?, decide, Finset.sum_range_id_mul_two, Finset.sum_range_id, Gauss, simpa, hint, rw?, nlinarith, ring1, abel1, abel_nf, ac_nf, noncomm_ring, linear_combination, subst_eqs, positivity, bound, norm_num1]
    solution: |
      induction n with
      | zero => rfl
      | succ k ih =>
        rw [Finset.sum_range_succ, Nat.mul_add, ih]
        ring
  - id: odd-numbers
    title: Odd numbers make squares
    mode: typed
    says: For every natural number n, the first n odd numbers add up to n × n.
    statement: "(n : ℕ) : ∑ i ∈ Finset.range n, (2 * i + 1) = n * n"
    forbid: [simp_all, aesop, grind, exact?, apply?, decide, Finset.sum_range_id_mul_two, Finset.sum_range_id, simpa, hint, rw?, nlinarith, ring1, abel1, abel_nf, ac_nf, noncomm_ring, linear_combination, subst_eqs, positivity, bound, norm_num1]
    solution: |
      induction n with
      | zero => rfl
      | succ k ih =>
        rw [Finset.sum_range_succ, ih]
        ring
---

The story goes that a schoolteacher, wanting some quiet, told the class to add up the numbers from 1 to 100, and that the young Gauss wrote down 5050 almost at once. Pair 1 with 100, 2 with 99, 3 with 98: fifty pairs, each making 101.

The trick gives a formula: 1 + 2 + … + n is n(n + 1)/2. This lesson proves it for every n. Pairing is a good way to *find* the formula. Induction is the way to be sure of it.

## Writing a sum

Mathematicians write a long sum with a capital sigma, Σ. Lean does too:

```lean
∑ i ∈ Finset.range 5, i
```

Read it as "the sum, for i in the range 5, of i". `Finset.range 5` is the collection 0, 1, 2, 3, 4: the five numbers *below* 5. So this sum is 0 + 1 + 2 + 3 + 4. After the comma comes what is added up for each i, and it can be any expression: `∑ i ∈ Finset.range 3, (2 * i + 1)` is 1 + 3 + 5.

A sum of particular numbers can be checked by working it out.

```exercise
id: a-small-sum
```

## A chain of equals

A written proof of an equation is often a chain: a = b = c = d, with a reason for each step. Lean has a way to write exactly that, called **calc**:

```lean
calc a = b + 1 := h1
  _ = 2 * c + 1 := by rw [h2]
```

Each line states one equality and then, after `:=`, gives its reason. The underscore `_` stands for "the right-hand side of the line above", so you do not write it twice. A reason is either a fact, as `h1` is, or `by` followed by moves.

This is a first look. `calc` earns its keep in Level 3, with longer chains and with inequalities. Type the chain above as your answer here. By custom the second line is indented.

```exercise
id: chain
```

## The sum of the first n numbers

The statement avoids dividing by 2, since division of natural numbers rounds down and gets in the way. It says: **twice** the sum 0 + 1 + … + n equals n(n + 1). The sum runs over `Finset.range (n + 1)` so that n itself is included.

On paper the step of the induction goes like this. Suppose twice the sum up to k is k(k + 1). The sum up to k + 1 is the sum up to k, plus k + 1. So twice it is k(k + 1) + 2(k + 1), and that is (k + 1)(k + 2).

In Lean, three rewrites do the same:

- `Finset.sum_range_succ` splits the last term off a sum: the sum over `range (m + 1)` is the sum over `range m`, plus the term at m.
- `Nat.mul_add` multiplies out: a × (b + c) = a × b + a × c.
- `ih` puts in what the induction hypothesis says.

What is left is an identity of ordinary algebra, k(k + 1) + 2(k + 1) = (k + 1)(k + 1 + 1). The move **ring** proves any identity that follows from the rules of algebra alone. It belongs to Level 3 and is borrowed here.

The base case is a sum with one term, 0, and `rfl` settles it.

```exercise
id: gauss
```

If you get stuck, this is the shape. The step takes two lines, so they go under their case, indented:

```lean
induction n with
| zero => …
| succ k ih =>
  rw […]
  ring
```

## Odd numbers make squares

1 = 1. 1 + 3 = 4. 1 + 3 + 5 = 9. 1 + 3 + 5 + 7 = 16. The first n odd numbers seem to add up to n × n. Four cases are evidence. Here is the proof.

The i-th odd number, counting from i = 0, is 2i + 1. This time the sum runs over `Finset.range n`: exactly n terms. The proof has the same shape as the last one, and is a little shorter.

```exercise
id: odd-numbers
```

## What you used

- `∑ i ∈ Finset.range n, …`: a sum over the n numbers 0, 1, …, n − 1.
- `calc`: a chain of equalities, each with its reason.
- `Finset.sum_range_succ` to split off the last term of a sum.
- Induction, with `ring` for the algebra at the end of the step.
