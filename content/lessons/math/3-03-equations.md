---
id: math-3-equations
title: Solving equations
track: math
level: 3
order: 3
concepts: [linear-equations]
summary: Solving an equation is a proof in two directions. A move that combines the facts on the board, and one that clears fractions.
exercises:
  - id: check
    title: Checking a solution
    mode: board
    says: Suppose x = 3. Then 2x + 1 = 7.
    statement: "(x : ℝ) (h : x = 3) : 2 * x + 1 = 7"
    moves: [rw, norm_num]
    solution: |
      rw [h]
      norm_num
  - id: solve
    title: Solving
    mode: board
    says: Suppose 2x + 1 = 7. Then x = 3.
    statement: "(x : ℝ) (h : 2 * x + 1 = 7) : x = 3"
    moves: [ring, norm_num, linarith]
    solution: |
      linarith
  - id: two-unknowns
    title: Two equations, two unknowns
    mode: board
    says: Suppose x + y = 5 and x − y = 1. Then x = 3 and y = 2.
    statement: "(x y : ℝ) (h1 : x + y = 5) (h2 : x - y = 1) : x = 3 ∧ y = 2"
    moves: [constructor, linarith]
    solution: |
      constructor
      linarith
      linarith
  - id: fractions
    title: Adding fractions
    mode: board
    says: Suppose a and b are not zero. Then 1/a + 1/b = (a + b)/(ab).
    statement: "(a b : ℝ) (ha : a ≠ 0) (hb : b ≠ 0) : 1 / a + 1 / b = (a + b) / (a * b)"
    moves: [ring, field_simp]
    solution: |
      field_simp
      ring
  - id: typed
    title: Now type one
    mode: typed
    says: Suppose 3x − 2 = x + 6. Then x = 4.
    statement: "(x : ℝ) (h : 3 * x - 2 = x + 6) : x = 4"
    solution: |
      linarith
---

"Solve 2x + 1 = 7." You subtract 1 from both sides, halve both sides, and write x = 3. What has been proved?

## Two directions

Two different statements are in play, and school algebra tends to run them together.

- **If x = 3, then 2x + 1 = 7.** This says 3 is *a* solution. You prove it by putting 3 in and calculating.
- **If 2x + 1 = 7, then x = 3.** This says 3 is the *only* solution. It is what the subtracting and halving proves: starting from the equation, each step follows from the one before.

"The solution is x = 3" means both. The first is a check and the second is the solving.

```exercise
id: check
```

## Combining facts

For the second direction, the fact on the board is `h : 2 * x + 1 = 7` and the goal is `x = 3`. Rewriting with h is no use, because the goal has no `2 * x + 1` in it to replace. `ring` is no use either: `x = 3` is not an identity. Try `ring` if you like.

What you did on paper was arithmetic on the *fact*: take 1 from both sides of h, then halve both sides. The move for that is **linarith**. It looks for a way to get the goal by adding the facts on the board together, each multiplied by some particular number. Here: half of h, and then tidying up.

The name is short for "linear arithmetic". *Linear* means the letters are only added and multiplied by particular numbers, never by each other. That is exactly the kind of equation the subtract-and-divide method solves.

```exercise
id: solve
```

With two equations it does what you would do by elimination. Adding h1 and h2 gives 2x = 6. Subtracting them gives 2y = 4.

```exercise
id: two-unknowns
```

`linarith` and `ring` do different jobs, and it helps to keep them apart:

- `ring` proves an equation true for all values, and ignores the facts.
- `linarith` proves an equation or inequality that follows *from the facts*, as long as everything is linear.

## Fractions

An equation with fractions in it is solved by multiplying through by the denominators. That is allowed only when they are not zero, which is why school answers come with "x ≠ 0" attached.

The move is **field_simp**. It multiplies through and cancels, using the facts on the board that say what is not zero. Usually it leaves an identity, and `ring` finishes. Below, the two "not zero" facts are `ha` and `hb`.

```exercise
id: fractions
```

After `field_simp` the goal was `b + a = a + b`: the fractions were gone, and what was left needed only `ring`.

## Typing it yourself

```exercise
id: typed
```

## What you used

- Solving an equation proves "if the equation holds, then x is this". Checking proves the other direction.
- `linarith` gets the goal by adding up multiples of the facts on the board.
- `field_simp` clears fractions, given that the denominators are not zero.
