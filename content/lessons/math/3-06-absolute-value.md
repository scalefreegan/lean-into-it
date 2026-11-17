---
id: math-3-absolute-value
title: Absolute value and distance
track: math
level: 3
order: 6
concepts: [absolute-value]
summary: The absolute value of a − b is the distance between a and b. Read that way, the triangle inequality says that a detour is never shorter.
exercises:
  - id: a-distance
    title: A distance
    mode: board
    says: The distance from 2 to 5 is 3.
    statement: ": |(2 : ℝ) - 5| = 3"
    moves: [norm_num]
    solution: |
      norm_num
  - id: never-negative
    title: Never negative
    mode: board
    says: For any real number x, 0 ≤ |x|.
    statement: "(x : ℝ) : 0 ≤ |x|"
    moves: [linarith, positivity]
    solution: |
      positivity
  - id: either-way
    title: The same in both directions
    mode: typed
    says: For any real numbers a and b, |a − b| = |b − a|.
    statement: "(a b : ℝ) : |a - b| = |b - a|"
    forbid: [grind, aesop, exact?, apply?, hint, rw?]
    solution: |
      exact abs_sub_comm a b
  - id: window
    title: Within 1 of 3
    mode: typed
    says: Suppose |x − 3| < 1. Then 2 < x and x < 4.
    statement: "(x : ℝ) (h : |x - 3| < 1) : 2 < x ∧ x < 4"
    forbid: [grind, bound, aesop, exact?, apply?, hint, rw?]
    solution: |
      rw [abs_lt] at h
      obtain ⟨h1, h2⟩ := h
      constructor
      linarith
      linarith
  - id: triangle
    title: The triangle inequality, by hand
    mode: typed
    says: For any real numbers a, b and c, |a − c| ≤ |a − b| + |b − c|.
    statement: "(a b c : ℝ) : |a - c| ≤ |a - b| + |b - c|"
    forbid: [grind, bound, aesop, exact?, apply?, hint, rw?, abs_sub_le, dist_triangle, dist_triangle_left, dist_triangle_right, abs_cases, polyrith]
    solution: |
      calc |a - c| = |(a - b) + (b - c)| := by ring_nf
        _ ≤ |a - b| + |b - c| := abs_add_le (a - b) (b - c)
---

The **absolute value** of a number, written |x|, is the number with its sign removed: |5| = 5 and |−5| = 5. As a rule: |x| is x when x is at least 0, and −x when x is negative.

That definition is easy to state and awkward to use. There is a better way to think of it.

## Distance

On the number line, |x| is **how far x is from 0**. Both 5 and −5 are five steps from 0.

And |a − b| is **the distance between a and b**. The distance from 2 to 5 is 3, whichever of them you subtract from the other.

```exercise
id: a-distance
```

Read every absolute value this way and most facts about it become facts about distance, which you already believe.

A distance is never negative. `positivity` knows this.

```exercise
id: never-negative
```

The distance from a to b is the distance from b to a. The library has that under the name `abs_sub_comm`: "abs", of a "sub", "comm" for swapping. In Lean `|x|` is typed with the ordinary bar on your keyboard.

```exercise
id: either-way
```

## Close to

"|x − 3| < 1" says that x is less than 1 away from 3. On the number line, those are the points strictly between 2 and 4: a window of half-width 1 centred on 3.

This is the most important use of absolute value. "x is within ε of a" is written |x − a| < ε, and the definitions of calculus, of a limit and of continuity, are built from statements of that form.

The fact that turns the distance into two ordinary inequalities is `abs_lt`:

```lean
abs_lt : |a| < b ↔ -b < a ∧ a < b
```

It is an "if and only if", and `rw` can rewrite with one of those as it does with an equation: the left side is replaced by the right. To rewrite inside a fact and not in the goal, add `at` and the fact's name:

```lean
rw [abs_lt] at h
```

After that line `h` is an "and": `-1 < x - 3 ∧ x - 3 < 1`. You know how to take that apart, and each half of the goal then follows by linear arithmetic.

```exercise
id: window
```

## The triangle inequality

> **The triangle inequality.** For all real numbers x and y, |x + y| ≤ |x| + |y|.

In terms of distance it reads better with three points. Going from a to c directly is never longer than going from a to b and then from b to c:

|a − c| ≤ |a − b| + |b − c|

On a line, if b is between a and c the two sides are equal, and if b is off to one side the detour is longer. The name comes from the same fact about the corners of a triangle in the plane.

The first form is in the library as `abs_add_le`:

```lean
abs_add_le a b : |a + b| ≤ |a| + |b|
```

The second form follows from the first by one observation, and it is a trick used all through analysis: **a − c is (a − b) + (b − c)**. The b has been added and taken away. Then the triangle inequality applies to that sum.

Written as a chain:

|a − c| = |(a − b) + (b − c)| ≤ |a − b| + |b − c|

Write that chain as a `calc`. For the first link use `ring_nf`, a relative of `ring` that can work inside the absolute value bars. For the second, give `abs_add_le` the two things being added: `abs_add_le (a - b) (b - c)`.

```exercise
id: triangle
```

Every "ε/2 plus ε/2" argument in calculus is this proof. If x is close to b and b is close to c, then x is close to c, and the triangle inequality says how close.

## What you used

- |a − b| is the distance between a and b.
- `abs_lt`: |a| < b means −b < a and a < b. `rw [...] at h` rewrites inside a fact.
- The triangle inequality, `abs_add_le`: |a + b| ≤ |a| + |b|.
- Adding and taking away the same thing, to split one distance into two.
