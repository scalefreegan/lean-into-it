---
id: lean-2-names
title: Theorems have names
track: lean
level: 2
order: 1
concepts: [finding-lemmas]
summary: Definitions, theorems and examples, how the library names what it has proved, and how to find a theorem when you know what it should say but not what it is called.
exercises:
  - id: add-comm
    title: Use a theorem by name
    mode: typed
    says: For any natural numbers a and b, a + b = b + a.
    statement: "(a b : ℕ) : a + b = b + a"
    forbid: &auto [omega, simp, simp_all, ring, ring_nf, linarith, nlinarith, abel, ac_rfl, aesop, grind, tauto, exact?, apply?, decide, norm_num]
    solution: |
      exact Nat.add_comm a b
  - id: mul-add
    title: Guess the name
    mode: typed
    says: For any natural numbers a, b and c, a × (b + c) = a × b + a × c.
    statement: "(a b c : ℕ) : a * (b + c) = a * b + a * c"
    forbid: *auto
    solution: |
      exact Nat.mul_add a b c
  - id: mul-one
    title: Guess another
    mode: typed
    says: For any natural number a, a × 1 = a.
    statement: "(a : ℕ) : a * 1 = a"
    forbid: *auto
    solution: |
      exact Nat.mul_one a
  - id: say-where
    title: Say where to rewrite
    mode: typed
    says: For any natural numbers a, b and c, (a + b) + c = a + (c + b).
    statement: "(a b c : ℕ) : a + b + c = a + (c + b)"
    forbid: *auto
    solution: |
      rw [Nat.add_assoc, Nat.add_comm b c]
  - id: search
    title: Let Lean look it up
    mode: typed
    says: Suppose a is at most b, and b is at most c. Then a is at most c.
    statement: "(a b c : ℕ) (h1 : a ≤ b) (h2 : b ≤ c) : a ≤ c"
    forbid: [omega, simp, simp_all, linarith, aesop, grind, tauto, apply?, decide, norm_num]
    solution: |
      exact Nat.le_trans h1 h2
---

The math lessons of this level have used facts from Lean's library by name: `Nat.succ_ne_zero`, `Nat.add_succ`, `Nat.add_comm`. That library, **Mathlib**, holds a few hundred thousand proved theorems. Nobody remembers them. What people learn is how the names are made, and how to search.

## Definitions, theorems, examples

A Lean file is a list of declarations. Three kinds matter now.

```lean
def double (n : ℕ) : ℕ := n + n

theorem double_eq (n : ℕ) : double n = 2 * n := by
  unfold double
  omega

example : double 3 = 6 := by rfl
```

- **def** makes a new thing and gives it a name: here a function. After the name come its inputs, a colon, the kind of thing it returns, and `:=` with what it is.
- **theorem** has the same form. The name is `double_eq`, the inputs are `(n : ℕ)`, after the colon is the statement, and after `:=` is the proof. It is the same form because, as the last Lean lesson said, a proof is a thing and a statement is its kind. `lemma` is another word for the same.
- **example** is a theorem with no name. It is checked and then forgotten. Every exercise in this app shows its statement as an `example`.

The part before the colon is where the board's objects and facts come from. In `(a b : ℕ) (h : a ≤ b) : a < b + 1`, the brackets introduce two numbers and one fact, and the claim follows the colon.

You can try the three declarations above in the **Playground**, which takes a whole Lean file. Add the line `#check double_eq` to have Lean print what a theorem says.

## How names are made

Library names are built to be guessed. They describe the statement, read left to right, in a fixed vocabulary.

- The operations: `add`, `mul`, `sub`, `succ`, `zero`, `one`.
- The relations: `le` for ≤, `lt` for <, `ne` for ≠, `dvd` for ∣.
- The well-known properties: `comm` for "the order can be swapped" (commutative), `assoc` for "the brackets can be moved" (associative).
- `trans` for "from a to b and from b to c gives a to c" (transitive).
- `_of_` means "follows from": `le_of_lt` concludes a `le` from a `lt`.

So `add_comm` is a + b = b + a, `mul_zero` is a × 0 = 0, and `add_assoc` is (a + b) + c = a + (b + c).

The `Nat.` in front says which numbers the theorem is about. Mathlib usually also has a general version with no prefix, such as `add_comm`, which is true of the real numbers as well. In these exercises either works.

A theorem with inputs is a for-all, and you use it as you would a for-all fact: `Nat.add_comm a b` is the fact `a + b = b + a`.

```exercise
id: add-comm
```

Now guess. Multiplying a sum: the statement starts with a `mul` and has an `add` inside it.

```exercise
id: mul-add
```

```exercise
id: mul-one
```

## Saying where

`rw [Nat.add_comm]` swaps the first sum it finds, and that may not be the one you meant. Give the theorem its inputs to say which: `Nat.add_comm b c` is the equation `b + c = c + b` and nothing else.

One thing to know when reading goals: Lean writes `a + b + c` for `(a + b) + c`. Sums group to the left unless brackets say otherwise.

```exercise
id: say-where
```

## Asking Lean to search

When you know what a theorem should say and cannot guess its name, write **exact?** as a line of the proof. Lean searches the library for a single theorem that closes the goal using your facts, and reports the line it found.

`exact?` is a way of looking things up. In finished work you replace it with the line it suggests, so that the proof says what it rests on and does not have to search again each time it is checked. Elsewhere in this app it is switched off, so that you do the exercise yourself. Here it is the point.

Type `exact?`, read what Lean suggests, and then put that line in its place.

```exercise
id: search
```

The name it found is one you could have guessed: `le` is ≤, and `trans` says it carries across.

## What you used

- `def`, `theorem`, `example`: a name, inputs, a colon, the kind or the statement, then `:=`.
- Names describe statements: `add_comm`, `mul_add`, `mul_one`, `le_trans`.
- `Nat.add_comm b c`: a theorem given its inputs is one particular fact.
- `exact?` to search the library.
