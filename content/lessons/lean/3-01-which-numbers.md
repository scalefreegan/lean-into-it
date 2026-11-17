---
id: lean-3-number-types
title: Which numbers?
track: lean
level: 3
order: 1
concepts: [number-types]
summary: In Lean every number has a kind, and the same symbols mean different things for different kinds. Subtraction and division on the natural numbers are the ones to watch.
exercises:
  - id: nat-minus
    title: Taking away too much
    mode: board
    says: Among the natural numbers, 5 − 7 is 0.
    statement: ": (5 : ℕ) - 7 = 0"
    moves: [rfl]
    solution: |
      rfl
  - id: int-minus
    title: The same sum in the integers
    mode: board
    says: Among the integers, 5 − 7 is −2.
    statement: ": (5 : ℤ) - 7 = -2"
    moves: [rfl]
    solution: |
      rfl
  - id: nat-divide
    title: Dividing and rounding down
    mode: board
    says: Among the natural numbers, 7 / 2 is 3.
    statement: ": (7 : ℕ) / 2 = 3"
    moves: [rfl]
    solution: |
      rfl
  - id: real-divide
    title: The same division in the reals
    mode: board
    says: Among the real numbers, 7 / 2 is 3.5.
    statement: ": (7 : ℝ) / 2 = 3.5"
    moves: [rfl, norm_num]
    solution: |
      norm_num
  - id: carried-over
    title: A natural number among the reals
    mode: board
    says: Suppose n is the natural number 3. Then n, as a real number, divided by 2 is 1.5.
    statement: "(n : ℕ) (h : n = 3) : (n : ℝ) / 2 = 1.5"
    moves: [rw, norm_num]
    solution: |
      rw [h]
      norm_num
  - id: not-undone
    title: Now type one
    mode: typed
    says: Among the natural numbers, 5 − 7 + 7 is 7.
    statement: ": (5 : ℕ) - 7 + 7 = 7"
    solution: |
      rfl
---

On paper, 5 is 5. In Lean there is a 5 that is a natural number, a 5 that is an integer and a 5 that is a real number, and they are three different things of three different kinds. Most of the time this goes unnoticed. This lesson is about the times it does not.

## Saying which

Lean has to know the kind of everything. When a statement mentions a letter `x : ℝ`, the numbers next to it are read as real numbers too, and nothing more need be said. When a statement is only numerals, there is nothing to go by, and Lean takes them for natural numbers.

To say otherwise, write the kind after a colon, in brackets: `(5 : ℝ)`. It is enough to mark one number. In `(7 : ℝ) / 2 = 3.5` the 7 is marked, so the division is division of real numbers, so the 2 and the 3.5 are real numbers as well.

The kinds you will see:

- `ℕ`, the natural numbers: 0, 1, 2, …
- `ℤ`, the integers: … −2, −1, 0, 1, 2, …
- `ℚ`, the rational numbers: fractions
- `ℝ`, the real numbers

In the editor, type `\N`, `\Z`, `\Q` or `\R` and then a space.

## Subtraction that stops at zero

Every operation in Lean must give an answer of the right kind. So what is 5 − 7 among the natural numbers, where there is no −2? Lean's answer is that subtraction on ℕ stops at zero.

```exercise
id: nat-minus
```

Among the integers the same symbols mean what you expect.

```exercise
id: int-minus
```

This matters more than it seems to. On paper, "subtract 7, then add 7" does nothing. On ℕ it can change the number, and so a rule of algebra you would use without thinking, a − b + b = a, is false there. The typed exercise at the end shows it. Whenever a proof about natural numbers has a minus sign in it, slow down.

## Division that rounds down

The same goes for division. Among the natural numbers there is no 3.5, and `/` gives the whole part and drops the rest.

```exercise
id: nat-divide
```

```exercise
id: real-divide
```

The second one needed `norm_num`. As the math lesson said, `rfl` computes, and real numbers are not computed with.

Division has one more surprise, in every kind of number: Lean lets you write `x / 0`, and its value is 0. Nothing can be proved from that which is not true, because every theorem about division that needs "not zero" asks for it as a fact. You will see `x ≠ 0` among the facts whenever a proof divides by x.

## Moving between kinds

A natural number can be used where a real number is wanted. Lean puts in the conversion for you and shows it as a small arrow: `↑n` is "n, taken as a real number". You write it as `(n : ℝ)`.

In the next exercise the statement has `(n : ℝ) / 2`, and the goal card shows `↑n / 2`. The fact `h` is about n as a natural number. Rewriting with it still works, and then the division is real division of 3 by 2.

```exercise
id: carried-over
```

The arrow is worth noticing because the two sides of it obey different rules. `↑(5 - 7)` subtracts in ℕ and then converts, giving 0. `↑5 - ↑7` converts and then subtracts in ℝ, giving −2. When a proof about real numbers will not go through and there is an arrow in the goal, that is the first thing to look at.

## Typing it yourself

```exercise
id: not-undone
```

## What you used

- A number's kind is written `(5 : ℝ)`. Unmarked numerals with no letter to go by are natural numbers.
- On ℕ, subtraction stops at 0 and division rounds down.
- `↑n` is a natural number taken as a real number, written `(n : ℝ)`.
