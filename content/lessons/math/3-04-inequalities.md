---
id: math-3-inequalities
title: Inequalities
track: math
level: 3
order: 4
concepts: [inequalities]
summary: The rules for working with ≤ and <, which are almost the rules for = but not quite. And the one fact most inequalities come from, that a square is never negative.
exercises:
  - id: add-them
    title: Adding two inequalities
    mode: board
    says: Suppose a ≤ b and c ≤ d. Then a + c ≤ b + d.
    statement: "(a b c d : ℝ) (h1 : a ≤ b) (h2 : c ≤ d) : a + c ≤ b + d"
    moves: [linarith]
    solution: |
      linarith
  - id: flip
    title: A minus sign turns it round
    mode: board
    says: Suppose a ≤ b. Then −b ≤ −a.
    statement: "(a b : ℝ) (h : a ≤ b) : -b ≤ -a"
    moves: [linarith]
    solution: |
      linarith
  - id: between
    title: Always one between
    mode: board
    says: Suppose a < b. Then there is a real number c with a < c and c < b.
    statement: "(a b : ℝ) (h : a < b) : ∃ c, a < c ∧ c < b"
    moves: [use, constructor, linarith]
    solution: |
      use (a + b) / 2
      constructor
      linarith
      linarith
  - id: times-nonneg
    title: Multiplying by something not negative
    mode: board
    says: Suppose a ≤ b and 0 ≤ c. Then ac ≤ bc.
    statement: "(a b c : ℝ) (h : a ≤ b) (hc : 0 ≤ c) : a * c ≤ b * c"
    moves: [linarith, nlinarith]
    solution: |
      nlinarith
  - id: a-square
    title: A square is not negative
    mode: board
    says: For any real numbers a and b, 0 ≤ (a − b)².
    statement: "(a b : ℝ) : 0 ≤ (a - b) ^ 2"
    moves: [linarith, positivity]
    solution: |
      positivity
  - id: from-the-square
    title: What the square gives
    mode: board
    says: Suppose 0 ≤ (a − b)². Then 2ab ≤ a² + b².
    statement: "(a b : ℝ) (h : 0 ≤ (a - b) ^ 2) : 2 * a * b ≤ a ^ 2 + b ^ 2"
    moves: [positivity, linarith]
    solution: |
      linarith
  - id: both-steps
    title: Both steps, typed
    mode: typed
    says: For any real numbers a and b, 2ab ≤ a² + b².
    statement: "(a b : ℝ) : 2 * a * b ≤ a ^ 2 + b ^ 2"
    forbid: [grind, bound, aesop, exact?, apply?, hint, rw?, two_mul_le_add_sq, two_mul_le_add_pow_two, polyrith]
    solution: |
      have h : 0 ≤ (a - b) ^ 2 := by positivity
      linarith
---

An equation says two things are the same. An inequality says which way they differ, and on the number line that is a matter of position: a < b means a is to the left of b, and a ≤ b means a is to the left of b or at the same point.

```widget
type: number-line
range: [-4, 4]
points: ["-2: a", "3: b"]
caption: a < b, a is to the left of b.
```

## The rules

Inequalities can be worked with almost as equations can.

**Add the same thing to both sides.** Sliding two points the same distance along the line does not change which is on the left. More generally, two inequalities pointing the same way can be added.

**Chain them.** If a ≤ b and b ≤ c then a ≤ c. If either link is strict, so is the result.

Both of these are linear, so `linarith` does them. It treats `≤` and `<` facts as it treats equations: it adds up multiples of them.

```exercise
id: add-them
```

**Multiplying is where care is needed.** Multiply both sides of 2 < 3 by −1 and you get −2 and −3, and −2 is the *larger*. On the number line, multiplying by −1 is a reflection through 0, and a reflection swaps left and right.

```widget
type: number-line
range: [-4, 4]
points: [2, 3, -2, -3]
caption: 2 is to the left of 3. Reflected through 0, −2 is to the right of −3.
```

```exercise
id: flip
```

So: multiplying both sides by a positive number keeps the direction, and multiplying by a negative number reverses it. Forgetting this, for instance by multiplying both sides by an x that might be negative, is the classic mistake with inequalities.

## There is always one between

Here is something true of the real numbers and false of the natural numbers: between any two there is another. Say which one: the point halfway is the natural choice. You can type an expression for `use`, with letters in it.

```widget
type: number-line
range: [0, 6]
points: ["1: a", "5: b", "3: (a + b)/2"]
caption: Halfway between a and b there is always another point.
```

```exercise
id: between
```

It follows that there is no "next" real number after a given one, and no smallest positive real number. Both facts matter in calculus.

## Multiplying by a letter

Now the multiplication rule, with a letter. `linarith` cannot do this one. Try it. The goal has `a * c` in it, a product of two letters, and that is not linear: to `linarith`, `a * c` is just some unknown quantity with no connection to a or c.

The move **nlinarith** goes one step further. Before doing what `linarith` does, it multiplies pairs of facts together and adds the results to the pile. Here it multiplies "0 ≤ b − a" by "0 ≤ c", which gives exactly what is wanted.

```exercise
id: times-nonneg
```

`nlinarith` is a search, and on harder goals it can run for a while and find nothing. A proof is clearer, and more likely to go through, when you say which fact matters. The rest of this lesson is about that.

## Squares

One fact about the real numbers produces more inequalities than any other:

> **The square of a real number is never negative.** A positive number times itself is positive, a negative number times itself is positive, and 0 times 0 is 0.

The move **positivity** proves that an expression is positive, or not negative, when that can be seen from how it is built: a square, an absolute value, a sum or product of things already known to be positive.

```exercise
id: a-square
```

That looks like a small thing to know. Now multiply the square out: (a − b)² = a² − 2ab + b². Saying this is at least 0 is saying that 2ab ≤ a² + b², which is not obvious at all. For a = 3 and b = 5 it says 30 ≤ 34.

In the next exercise the fact about the square is already on the board. `linarith` finishes from it: it multiplies out both sides before it starts, and after that the goal is the fact, rearranged.

```exercise
id: from-the-square
```

All the thinking in that proof was in choosing which square to look at. The rest was bookkeeping, and the automation did it. This is how most proofs of inequalities go: **find the right thing that is obviously not negative, and the rest is algebra.**

## Stating a fact of your own

In the last exercise somebody put the useful fact on the board for you. In a real proof you put it there yourself. The typed move for that is **have**:

```lean
have h : 0 ≤ (x - 1) ^ 2 := by positivity
```

Read it as "we have, and will call h, the fact that 0 ≤ (x − 1)², by positivity". After the name and a colon comes the statement, and after `:= by` comes its proof, which here is one move. From the next line on, `h` is a fact like any other. A written proof does the same when it says "note that (x − 1)² ≥ 0".

Now prove the inequality from the last exercise with nothing given. State the fact about the square yourself, and then finish.

```exercise
id: both-steps
```

## What you used

- Inequalities add and chain. Multiplying by a negative number reverses them.
- `linarith` handles `≤` and `<` as it handles `=`, as long as everything is linear.
- `nlinarith` also tries products of pairs of facts.
- `positivity` proves that something is positive or not negative from its form.
- `have name : statement := by …` states and proves a fact of your own in the middle of a proof.
