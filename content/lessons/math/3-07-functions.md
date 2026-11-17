---
id: math-3-functions
title: Functions, increasing and bounded
track: math
level: 3
order: 7
concepts: [functions]
summary: A function as a rule and as a graph. What it means, exactly, for one to be increasing or to be bounded, and how each is proved.
exercises:
  - id: a-value
    title: A value
    mode: board
    says: Suppose f(x) = 2x + 1 for every x. Then f(3) = 7.
    statement: "(f : ℝ → ℝ) (hf : ∀ x, f x = 2 * x + 1) : f 3 = 7"
    moves: [rw, norm_num]
    solution: |
      rw [hf]
      norm_num
  - id: one-after-another
    title: One function after another
    mode: board
    says: Suppose f(x) = x + 1 and g(x) = 2x for every x. Then f(g(3)) = 7.
    statement: "(f g : ℝ → ℝ) (hf : ∀ x, f x = x + 1) (hg : ∀ x, g x = 2 * x) : f (g 3) = 7"
    moves: [rw, norm_num]
    solution: |
      rw [hg]
      rw [hf]
      norm_num
  - id: increasing
    title: An increasing function
    mode: board
    says: Suppose f(x) = 2x + 1 for every x. Then for all x and y, if x ≤ y then f(x) ≤ f(y).
    statement: "(f : ℝ → ℝ) (hf : ∀ x, f x = 2 * x + 1) : ∀ x y, x ≤ y → f x ≤ f y"
    moves: [intro, rw, linarith]
    solution: |
      intro x
      intro y
      intro h
      rw [hf]
      rw [hf]
      linarith
  - id: not-increasing
    title: Squaring is not increasing
    mode: board
    says: There are real numbers x and y with x ≤ y and y² < x².
    statement: ": ∃ x y : ℝ, x ≤ y ∧ y ^ 2 < x ^ 2"
    moves: [use, norm_num]
    solution: |
      use -1, 0
      norm_num
  - id: increasing-twice
    title: Increasing, then increasing
    mode: board
    says: Suppose f and g are both increasing. Then for all x and y, if x ≤ y then f(g(x)) ≤ f(g(y)).
    statement: "(f g : ℝ → ℝ) (hf : ∀ x y, x ≤ y → f x ≤ f y) (hg : ∀ x y, x ≤ y → g x ≤ g y) : ∀ x y, x ≤ y → f (g x) ≤ f (g y)"
    moves: [intro, apply, exact]
    solution: |
      intro x
      intro y
      intro h
      apply hf
      apply hg
      exact h
  - id: bounded
    title: Bounded on an interval
    mode: board
    says: There is a number M such that 2x + 1 ≤ M for every x between 0 and 1.
    statement: ": ∃ M : ℝ, ∀ x : ℝ, 0 ≤ x → x ≤ 1 → 2 * x + 1 ≤ M"
    moves: [use, intro, linarith]
    solution: |
      use 3
      intro x
      intro h
      intro h1
      linarith
  - id: never-below
    title: Now type one
    mode: typed
    says: Suppose f(x) = x² for every x. Then 0 ≤ f(x) for every x.
    statement: "(f : ℝ → ℝ) (hf : ∀ x, f x = x ^ 2) : ∀ x, 0 ≤ f x"
    forbid: [grind, aesop, exact?, apply?, hint, rw?]
    solution: |
      intro x
      rw [hf]
      positivity
---

A **function** is a rule that takes a number in and gives a number back, the same one every time for the same input. "Double it and add 1" is a function. Its **graph** is the picture of the rule: above each point x on a horizontal number line, mark a point at height f(x). For "double it and add 1" the marks form a straight line climbing to the right.

## Functions in Lean

The kind of a function from real numbers to real numbers is written `ℝ → ℝ`. Applying f to x is written `f x`, with a space and no brackets. Brackets are for grouping only: `f (x + 1)`.

In these exercises a function is described by a fact that gives its rule: `hf : ∀ x, f x = 2 * x + 1`. That is a for-all, and an equation, so you can rewrite with it. `rw [hf]` finds an `f` applied to something in the goal and replaces it by the rule's right-hand side, with that something in place of x.

```exercise
id: a-value
```

Doing one function and then another is called **composing** them. f(g(3)) means: apply g to 3, then f to the result. Rewrite from the inside out.

```exercise
id: one-after-another
```

The order matters. With the same f and g, g(f(3)) is 2 × (3 + 1) = 8.

## Increasing

Look at the graph of 2x + 1: as you move right, it goes up. "Goes up as you move right" is a statement about a picture. To prove anything it has to become a statement about numbers:

> A function f is **increasing** if for all x and y, x ≤ y implies f(x) ≤ f(y).

Take any two inputs. If the first is to the left of the second, its output is no higher. That is the picture, said precisely.

It is a for-all followed by an if-then, so the proof begins the way such proofs always do: take an arbitrary x and y, and assume x ≤ y. Then the rule for f turns the goal into arithmetic. You will need to rewrite twice, once for `f x` and once for `f y`.

```exercise
id: increasing
```

Not every function is increasing. The graph of x² is a bowl: it comes down on the left of 0 and goes up on the right. To show that squaring is not increasing you need one pair of inputs, in order, whose outputs are in the wrong order. Look on the left side of the bowl.

```exercise
id: not-increasing
```

Now a general fact, with no formulas at all. If g is increasing and f is increasing, then doing g and then f is increasing. The proof only moves facts around: to compare f(g(x)) with f(g(y)), it is enough by `hf` to compare g(x) with g(y), and for that it is enough by `hg` to compare x with y.

```exercise
id: increasing-twice
```

That proof used no arithmetic and would work for functions on anything that has an order. Proofs from definitions are like that: once "increasing" is a precise statement, logic from Level 1 does the rest.

## Bounded

The graph of 2x + 1 climbs for ever, so no horizontal line stays above it. But look only at the part between x = 0 and x = 1, and it stays under height 3.

> A function is **bounded above** on a set of inputs if there is one number M with f(x) ≤ M for every x in the set.

The order of the words matters: *there is* an M, and then *for every* x. One M has to work for all the inputs at once. So the proof starts by naming M, and only then takes an arbitrary x.

```exercise
id: bounded
```

Any number from 3 upwards would have done for M. A bound does not have to be the best one.

## Typing it yourself

The graph of x² never goes below the horizontal axis. Say it for every x, and prove it.

```exercise
id: never-below
```

## What you used

- `f : ℝ → ℝ` is a function, `f x` is its value at x, and a rule `∀ x, f x = …` can be rewritten with.
- Increasing: for all x and y, x ≤ y implies f(x) ≤ f(y).
- Bounded above: there is an M with f(x) ≤ M for all x in question.
- A picture suggests the statement. The definition is what gets proved.
