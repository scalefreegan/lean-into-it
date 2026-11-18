---
id: math-3-identities
title: Identities
track: math
level: 3
order: 2
concepts: [ring]
summary: An identity is an equation true for every value of its letters. One move proves all of them, and it is worth knowing what it does and what it cannot see.
exercises:
  - id: square-of-a-sum
    title: The square of a sum
    mode: board
    says: For any real numbers a and b, (a + b)² = a² + 2ab + b².
    statement: "(a b : ℝ) : (a + b) ^ 2 = a ^ 2 + 2 * a * b + b ^ 2"
    moves: [ring]
    solution: |
      ring
  - id: difference-of-squares
    title: The difference of two squares
    mode: board
    says: For any real numbers a and b, (a + b)(a − b) = a² − b².
    statement: "(a b : ℝ) : (a + b) * (a - b) = a ^ 2 - b ^ 2"
    moves: [ring]
    solution: |
      ring
  - id: not-an-identity
    title: A tempting mistake
    mode: board
    says: There are real numbers a and b for which (a + b)² is not a² + b².
    statement: ": ∃ a b : ℝ, (a + b) ^ 2 ≠ a ^ 2 + b ^ 2"
    moves: [use, norm_num]
    solution: |
      use 1, 1
      norm_num
  - id: with-a-fact
    title: When a fact is needed
    mode: board
    says: Suppose a = 2b. Then a + b = 3b.
    statement: "(a b : ℝ) (h : a = 2 * b) : a + b = 3 * b"
    moves: [ring, rw]
    solution: |
      rw [h]
      ring
  - id: by-hand
    title: Once by hand
    mode: typed
    says: For any real numbers a, b and c, a(b + c) = ac + ab.
    statement: "(a b c : ℝ) : a * (b + c) = a * c + a * b"
    forbid: [ring, ring_nf, ring1, linarith, nlinarith, simp, simp_all, simpa, norm_num, grind, linear_combination, linear_combination', noncomm_ring, abel, abel1, abel_nf, ac_rfl, ac_nf, module, aesop, exact?, apply?, rw?, hint, bound, omega, field_simp, positivity, ring1_nf, field, grobner, algebra, group]
    solution: |
      rw [mul_add, add_comm]
  - id: cube
    title: Now type one
    mode: typed
    says: For any real number x, (x + 1)³ = x³ + 3x² + 3x + 1.
    statement: "(x : ℝ) : (x + 1) ^ 3 = x ^ 3 + 3 * x ^ 2 + 3 * x + 1"
    solution: |
      ring
---

Some equations are true for one value of x, and finding it is called solving. Others are true for **every** value of every letter in them. Those are called **identities**:

(a + b)² = a² + 2ab + b²

You can see why this one holds by drawing it. A square of side a + b is cut by one line across and one line down into four pieces: a square of side a, a square of side b, and two rectangles, each a by b. The area of the whole is the sum of the areas of the pieces. Move a and b: the two totals stay equal.

```widget
type: square-of-sum
a: 3
b: 2
```

## How an identity is proved

The picture only works for positive lengths. The algebra works for all real numbers, and it uses nothing but the rules of arithmetic from the last lesson:

(a + b)(a + b) = a(a + b) + b(a + b) = aa + ab + ba + bb = a² + 2ab + b²

Each step is `mul_add` or `mul_comm` or one of the others. Nothing here needs an idea. It needs care, and for a long expression a great deal of it.

That is what the move **ring** is for. It proves any equation that follows from the rules of arithmetic alone. It works by multiplying everything out on both sides, collecting like terms, and checking that the two results are the same. It is called `ring` because a *ring* is the mathematician's word for a set of numbers obeying these rules.

```exercise
id: square-of-a-sum
```

```exercise
id: difference-of-squares
```

Using `ring` here is the honest thing to do. A mathematician writing a proof says "expanding, we get…" and does not list every use of the distributive law. The reader is trusted to be able to check it, and with `ring`, Lean has.

## What ring cannot see

`ring` proves identities, and only identities. That has two consequences.

**It will not prove something false.** The commonest mistake in algebra is to write (a + b)² = a² + b². `ring` refuses it, because the two sides multiply out to different things: the 2ab is missing. A refusal is not a proof that the equation is wrong, though. To show that, one pair of numbers is enough. Type two numbers for `use` with a comma between them, and then calculate.

```exercise
id: not-an-identity
```

**It does not read the facts on the board.** Below, `a + b = 3 * b` is not an identity: it is false for most a and b. It is true here because of the fact `h`. Try `ring` first, and read the refusal. Then use the fact, by rewriting with it, and what is left is an identity.

```exercise
id: with-a-fact
```

## Once by hand

So that the rules under `ring` are not a mystery, here is one small identity to prove without it. Two of the named rules, used one after the other with `rw`, are enough: one to multiply out the bracket and one to swap the two terms. The automatic moves are switched off.

```exercise
id: by-hand
```

One was enough. From here on, identities are `ring`'s job, and the rest of this level is about the steps that do need an idea.

## Typing it yourself

```exercise
id: cube
```

## What you used

- An identity is an equation true for every value of its letters.
- `ring` proves identities by multiplying out and collecting terms.
- `ring` does not use facts from the board. Rewrite with them first.
