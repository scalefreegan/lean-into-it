---
id: math-2-recursion
title: Addition, defined
track: math
level: 2
order: 3
concepts: [recursion]
summary: Addition and multiplication are not given. They are defined, by saying what to do at zero and what to do at "the one after". Some facts then come free, and one that looks just as obvious does not.
exercises:
  - id: add-zero
    title: Adding zero
    mode: board
    says: For any natural number a, a + 0 = a.
    statement: "(a : ℕ) : a + 0 = a"
    moves: [rfl]
    solution: |
      rfl
  - id: add-succ
    title: Adding the one after
    mode: board
    says: For any natural numbers a and b, a + (b + 1) = (a + b) + 1.
    statement: "(a b : ℕ) : a + (b + 1) = (a + b) + 1"
    moves: [rfl]
    solution: |
      rfl
  - id: mul-zero
    title: Multiplying by zero
    mode: board
    says: For any natural number a, a × 0 = 0.
    statement: "(a : ℕ) : a * 0 = 0"
    moves: [rfl]
    solution: |
      rfl
  - id: mul-succ
    title: Multiplying by the one after
    mode: board
    says: For any natural numbers a and b, a × (b + 1) = a × b + a.
    statement: "(a b : ℕ) : a * (b + 1) = a * b + a"
    moves: [rfl]
    solution: |
      rfl
  - id: zero-add
    title: Zero on the other side
    mode: board
    says: For any natural number a, 0 + a = a.
    statement: "(a : ℕ) : 0 + a = a"
    moves: [rfl, simp]
    solution: |
      simp
  - id: typed
    title: Now type one
    mode: typed
    says: For any natural numbers a and b, a × (b + 1) = a + a × b.
    statement: "(a b : ℕ) : a * (b + 1) = a + a * b"
    forbid: [omega, simp, simp_all, ring, ring_nf, linarith, nlinarith, abel, ac_rfl, aesop, grind, tauto, exact?, apply?, decide, norm_num, simpa, hint, rw?, ring1, abel1, abel_nf, ac_nf, noncomm_ring, linear_combination, subst_eqs, positivity, bound, norm_num1]
    solution: |
      rw [Nat.mul_succ, Nat.add_comm]
---

If a natural number is only "zero, or the one after something", then nobody has yet said what **adding** two of them means. It has to be defined. The definition is short, and it follows the shape of the numbers themselves.

## Defining addition

To define a + b for every b, say two things:

- what a + 0 is: **a + 0 = a**
- what a + (the one after b) is, given a + b: **a + (b + 1) = (a + b) + 1**

That is enough. To work out 5 + 2, the second line turns it into (5 + 1) + 1, the second line again turns 5 + 1 into (5 + 0) + 1, and the first line turns 5 + 0 into 5. A definition that refers to itself on a smaller input like this is called *recursive*.

Because these two lines *are* the definition, Lean accepts both by `rfl`, even with letters in them. There is nothing to prove: each side works out to the same thing.

```exercise
id: add-zero
```

```exercise
id: add-succ
```

## Multiplication the same way

Multiplication is defined from addition by the same two-line pattern:

- **a × 0 = 0**
- **a × (b + 1) = a × b + a**

```exercise
id: mul-zero
```

```exercise
id: mul-succ
```

## The one that does not come free

Now a surprise. `a + 0 = a` was true by definition. What about `0 + a = a`?

Look at the definition again. It says what to do when the **second** number is 0 or a successor. In `0 + a` the second number is `a`, a letter. Lean cannot tell which of the two lines applies, so it cannot work anything out. The statement is true, but it is not true *by definition*. It needs a proof.

Click **rfl** first and read what Lean says. Then use **simp**.

```exercise
id: zero-add
```

**simp** is short for *simplify*. It knows a large library of facts that people have already proved, and it rewrites the goal with them until nothing more applies. `0 + a = a` is in that library. Somebody did prove it, and the next lesson shows how: it takes an idea you have not used yet.

This is a real difference between a + 0 and 0 + a, and it is not a quirk of Lean. Any careful definition of addition has to recurse on one side, and the other side then has to be earned.

## Typing it yourself

Each line of the two definitions has a name in the library:

- `Nat.add_zero`: a + 0 = a
- `Nat.add_succ`: a + (b + 1) = (a + b) + 1
- `Nat.mul_zero`: a × 0 = 0
- `Nat.mul_succ`: a × (b + 1) = a × b + a

So does a fact that is *not* a definition: `Nat.add_comm`, which says a + b = b + a.

A named theorem works in `rw` just as a fact on the board does. Here, rewrite with one of the definitions, then swap the two sides of a sum.

```exercise
id: typed
```

## What you used

- Addition and multiplication are defined by recursion on the second number.
- `rfl` proves what is true by definition, such as `a + 0 = a`.
- `0 + a = a` is true but not by definition.
- `simp` simplifies with a library of proved facts.
- `rw [Nat.mul_succ]`: rewriting with a named theorem.
