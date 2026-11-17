---
id: math-3-real-numbers
title: The real numbers
track: math
level: 3
order: 1
concepts: [real-numbers]
summary: The numbers of the number line, with no gaps. What Lean takes as known about them, and why it calculates with them differently.
exercises:
  - id: halves
    title: Two halves
    mode: board
    says: A half plus a half is 1.
    statement: ": (1 : ℝ) / 2 + 1 / 2 = 1"
    moves: [rfl, decide, norm_num]
    solution: |
      norm_num
  - id: has-a-half
    title: An equation with a solution
    mode: board
    says: There is a real number x with 2x = 1.
    statement: ": ∃ x : ℝ, 2 * x = 1"
    moves: [use, norm_num]
    solution: |
      use 1 / 2
      norm_num
  - id: no-natural-half
    title: The same equation, no solution
    mode: board
    says: There is no natural number n with 2n = 1.
    statement: ": ¬ ∃ n : ℕ, 2 * n = 1"
    moves: [intro, obtain, omega]
    solution: |
      intro h
      obtain ⟨n, hn⟩ := h
      omega
  - id: a-rule-by-name
    title: A rule, by name
    mode: typed
    says: For any real numbers a and b, a + b = b + a.
    statement: "(a b : ℝ) : a + b = b + a"
    forbid: [ring, ring_nf, ring1, linarith, nlinarith, simp, simp_all, simpa, norm_num, grind, linear_combination, noncomm_ring, abel, abel1, abel_nf, ac_rfl, ac_nf, module, aesop, exact?, apply?, rw?, hint, bound, omega]
    solution: |
      exact add_comm a b
  - id: tenths
    title: Now type one
    mode: typed
    says: 0.1 + 0.2 = 0.3, exactly.
    statement: ": (0.1 : ℝ) + 0.2 = 0.3"
    solution: |
      norm_num
---

Level 2 built the natural numbers from nothing: zero, and the one after. This level is about a much larger set of numbers, and it does not build them. It says what is true of them and works from there.

## The number line

Draw a line. Mark a point 0 and a point 1. Every point on the line is a **real number**, and every real number is a point on the line.

- The natural numbers 0, 1, 2, 3 … are evenly spaced to the right.
- The negative whole numbers go to the left: together with the naturals they are the **integers**, ℤ.
- The fractions, such as 1/2 and −7/3, fall between: the **rational numbers**, ℚ.
- And there are points that no fraction lands on. The diagonal of a square of side 1 has length √2, which is not a fraction. π is not a fraction either.

The real numbers, written ℝ, are all the points: the line with no gaps. That "no gaps" is what calculus needs, and Level 5 will say exactly what it means.

## What the real numbers allow

Each step from ℕ to ℝ makes an equation solvable that was not before. `2 * x = 1` has no solution among the natural numbers. Among the real numbers it has one.

```exercise
id: has-a-half
```

```exercise
id: no-natural-half
```

## Calculating

In Level 0 you met two moves that calculate. **rfl** and **decide** work a thing out the way a program would: they run the definition. That is fine for natural numbers, which are finite things. A real number is not. It can have infinitely many digits, and there is no program that takes two of them and reports whether they are equal.

So Lean does not compute with real numbers. It reasons about them from proved facts, and the move for that is **norm_num**. Try `rfl` here first, and then `decide`, and read what Lean says to each.

```exercise
id: halves
```

## What is taken as known

A textbook on analysis starts with a list of about a dozen rules, and everything else in the book is proved from them. Mathlib proves the same rules from a construction of the real numbers, so in Lean they are theorems with names, and nothing is assumed. For our purposes it comes to the same list.

**The rules of arithmetic.** For all real numbers a, b, c:

- `add_comm`: a + b = b + a, and `mul_comm`: a × b = b × a
- `add_assoc`: (a + b) + c = a + (b + c), and `mul_assoc` likewise
- `add_zero`: a + 0 = a, and `mul_one`: a × 1 = a
- every a has a negative, with a + (−a) = 0
- every a other than 0 has a reciprocal, with a × (1/a) = 1
- `mul_add`: a × (b + c) = a × b + a × c

**The rules of order.** Any two real numbers can be compared. If a ≤ b then a + c ≤ b + c. If 0 ≤ a and 0 ≤ b then 0 ≤ a × b.

**Completeness**, the rule that says there are no gaps. It waits for Level 5.

Every identity of school algebra follows from the first group, and every fact about inequalities from the first two. This level is about those consequences. The names follow the pattern from the lesson on theorem names, and they have no `Nat.` in front, because they hold for many kinds of number at once.

```exercise
id: a-rule-by-name
```

## Typing it yourself

A computer's built-in decimal arithmetic famously gets this one wrong: it says 0.1 + 0.2 is 0.30000000000000004. Those are approximations with a fixed number of digits. Lean's `ℝ` is the real thing, and the statement below is exactly true. It needs `(0.1 : ℝ)` to say which kind of number is meant. The Lean lesson of this level is about that.

```exercise
id: tenths
```

## What you used

- ℝ is the whole number line: ℕ, ℤ and ℚ sit inside it, and so do √2 and π.
- Lean reasons about real numbers and does not compute with them: `norm_num`, not `rfl` or `decide`.
- The rules of arithmetic and of order are theorems with names, such as `add_comm`.
