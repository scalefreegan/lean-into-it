---
id: math-3-calc
title: Chains
track: math
level: 3
order: 5
concepts: [calc]
summary: A textbook proves an inequality as a chain, a ≤ b = c < d, with a reason for each link. Lean has the same form, and it is the nearest a Lean proof comes to a written one.
exercises:
  - id: two-links
    title: Two links
    mode: typed
    says: Suppose a ≤ b and b < c. Then a < c.
    statement: "(a b c : ℝ) (h1 : a ≤ b) (h2 : b < c) : a < c"
    forbid: [linarith, nlinarith, positivity, norm_num, simp, simpa, polyrith, cc, grind, bound, order, aesop, simp_all, exact?, apply?, hint, rw?, linear_combination, linear_combination', omega, decide, tauto]
    solution: |
      calc a ≤ b := h1
        _ < c := h2
  - id: side-by-side
    title: Part by part
    mode: board
    says: Suppose 0 ≤ a and a ≤ b. Then a² ≤ b².
    statement: "(a b : ℝ) (ha : 0 ≤ a) (h : a ≤ b) : a ^ 2 ≤ b ^ 2"
    moves: [linarith, gcongr]
    solution: |
      gcongr
  - id: which-reason
    kind: fill
    title: Which reason?
    says: Suppose x ≤ 2 and y ≤ 3. Then x + y ≤ 5.
    statement: "(x y : ℝ) (h1 : x ≤ 2) (h2 : y ≤ 3) : x + y ≤ 5"
    proof: |
      calc x + y ≤ 2 + 3 := by <gap>
        _ = 5 := by norm_num
    options: [ring, gcongr, norm_num, rfl]
    solution: gcongr
  - id: a-bound
    title: Bounding an expression
    mode: typed
    says: Suppose x ≤ 2 and y ≤ 3. Then 2x + y ≤ 7.
    statement: "(x y : ℝ) (h1 : x ≤ 2) (h2 : y ≤ 3) : 2 * x + y ≤ 7"
    forbid: [linarith, nlinarith, positivity, polyrith, grind, bound, order, aesop, simp_all, exact?, apply?, hint, rw?, linear_combination, linear_combination', omega, decide, tauto]
    solution: |
      calc 2 * x + y ≤ 2 * 2 + 3 := by gcongr
        _ = 7 := by norm_num
  - id: it-grows
    title: A chain with an idea in it
    mode: typed
    says: Suppose 1 < x. Then x < x².
    statement: "(x : ℝ) (h : 1 < x) : x < x ^ 2"
    forbid: [linarith, nlinarith, polyrith, grind, bound, order, aesop, simp_all, exact?, apply?, hint, rw?, linear_combination, linear_combination', omega, decide, tauto, field_simp, field]
    solution: |
      calc x = x * 1 := by ring
        _ < x * x := by gcongr
        _ = x ^ 2 := by ring
---

Open an analysis textbook at any proof of an inequality and you will find something like this:

2x + y ≤ 2·2 + 3 = 7

It is read left to right. Each sign is a claim with its own small reason, and the conclusion is the first thing compared with the last: 2x + y ≤ 7. The lesson on sums showed Lean's form of this, **calc**, with equalities. Its real use is with inequalities.

## The form

Suppose the facts on the board are `h1 : x = y`, `h2 : y ≤ z` and `h3 : z < w`. Then this proves `x < w`:

```lean
calc x = y := h1
  _ ≤ z := h2
  _ < w := h3
```

- The first line starts the chain: a claim, then `:=`, then its proof.
- Each later line starts with an underscore, which stands for "the right-hand side of the line above". By custom it is indented, so that the signs line up.
- A proof can be the name of a fact, as here, or `by` and a move: `:= by ring`.

The links may be a mixture of `=`, `≤` and `<`. Lean works out what the whole chain says: all `=` gives `=`, any `<` among them gives `<`, and otherwise `≤`. They must all point the same way. A chain cannot mix `≤` with `≥`, on paper or in Lean.

In this lesson the moves that would do the whole thing in one step are switched off. You know they work. The point here is to write down *why*.

Start with a chain of two links. The facts are on the board, and each link is one of them.

```exercise
id: two-links
```

## Comparing part by part

The commonest reason for a link in a chain is this: the two sides are built the same way, and each part of the left is at most the matching part of the right. If x ≤ 2 and y ≤ 3 then 2x + y ≤ 2·2 + 3, because the sides have the same form and you have compared them piece by piece.

The move for that reason is **gcongr**. It lines the two sides up, finds the places where they differ, and looks among your facts for the comparison of each pair. If a comparison needs something to be not negative, as multiplying does, it looks for that too.

Below, `a ^ 2` and `b ^ 2` have the same form and differ in a against b. Squaring keeps the order only for numbers that are not negative (−3 ≤ 2, and 9 is not ≤ 4), so `gcongr` needs `ha` as well as `h`. It finds both.

```exercise
id: side-by-side
```

When `gcongr` cannot find one of the things it needs, it does not fail. It leaves that as a goal for you.

Here is a chain with one reason missing. The second link is a calculation, and `norm_num` does it. Which move proves the first link? Lean checks the chain with your choice in place.

```exercise
id: which-reason
```

`ring` and `norm_num` prove what is true of all numbers, and x + y ≤ 2 + 3 is not: it is true because of `h1` and `h2`. Only the move that goes and looks for those facts can prove it.

## A chain of your own

Now the chain from the top of this lesson. The first link is the comparison part by part. The second is a calculation.

```exercise
id: a-bound
```

Compare what you typed with the line of mathematics it came from. They are nearly the same text. A `calc` proof can be read by someone who knows no Lean, which cannot be said of `linarith`.

## A chain with an idea in it

Why is a number bigger than 1 smaller than its square? One way to say it: x is x × 1, and replacing that 1 by the larger number x makes the product larger, since x is positive. That is a chain of three links:

x = x · 1 < x · x = x²

The first and last links are identities. The middle one is a comparison part by part: `x * 1` and `x * x` differ in 1 against x, and you have `h : 1 < x`.

```exercise
id: it-grows
```

The trick in the first link, writing x as x · 1 so that the two sides have the same form, is typical. A good deal of proving inequalities is rewriting one side until it looks like the other.

## What you used

- `calc`: a chain of `=`, `≤` and `<`, each link with its reason. `_` stands for the end of the line before.
- `gcongr` proves a link whose two sides have the same form, by comparing the parts.
- A chain shows the reasoning. One automatic move shows only that the reasoning exists.
