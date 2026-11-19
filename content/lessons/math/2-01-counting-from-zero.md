---
id: math-2-natural-numbers
title: Counting from zero
track: math
level: 2
order: 1
concepts: [natural-numbers]
summary: What a natural number is, to Lean and to a logician. There is zero, and there is "the one after". Everything else about the numbers is built from those two.
exercises:
  - id: after-three
    title: The one after 3
    mode: board
    says: The number after 3 is 4.
    statement: ": Nat.succ 3 = 4"
    moves: [rfl]
    solution: |
      rfl
  - id: two
    title: Two, spelled out
    mode: board
    says: The number after the number after 0 is 2.
    statement: ": Nat.succ (Nat.succ 0) = 2"
    moves: [rfl]
    solution: |
      rfl
  - id: succ-is-plus-one
    title: The one after n
    mode: board
    says: For any natural number n, the number after n is n + 1.
    statement: "(n : ℕ) : Nat.succ n = n + 1"
    moves: [rfl]
    solution: |
      rfl
  - id: not-equal
    title: Different numbers
    mode: board
    says: 3 is not equal to 5.
    statement: ": (3 : ℕ) ≠ 5"
    moves: [rfl, decide]
    solution: |
      decide
  - id: less
    title: Smaller
    mode: board
    says: 7 is less than 10.
    statement: ": (7 : ℕ) < 10"
    moves: [decide]
    solution: |
      decide
  - id: never-zero
    title: Now type one
    mode: typed
    says: For any natural number n, n + 1 is not 0.
    statement: "(n : ℕ) : n + 1 ≠ 0"
    forbid: [omega, simp, simp_all, aesop, grind, tauto, exact?, apply?, norm_num, positivity, linarith, simpa, hint, rw?, nlinarith, ring1, abel1, abel_nf, ac_nf, noncomm_ring, linear_combination, subst_eqs, bound, norm_num1]
    solution: |
      exact Nat.succ_ne_zero n
---

Level 1 was about statements in general. This level is about one kind of thing, the **natural numbers**: 0, 1, 2, 3 and so on. Lean writes the collection of them `ℕ`. In Lean, as for most logicians, they start at 0.

You have known these numbers all your life, so it is fair to ask what there is to say. The answer is that to *prove* things about all of them at once, you need to know exactly what they are. There is a short answer.

## Zero, and the one after

> A natural number is either **zero**, or **the one after** some natural number. Nothing else is a natural number.

That is the whole definition. "The one after" is called the *successor*, and Lean writes it `Nat.succ`. So 1 is `Nat.succ 0`, 2 is `Nat.succ (Nat.succ 0)`, and so on. The numerals 1, 2, 3 are shorthand.

Lean has a second way of writing the same thing, and it is the one you will see on the board: `x.succ` means `Nat.succ x`. So `(Nat.succ 0).succ`{say: nat suck of 0, dot suck} is `Nat.succ (Nat.succ 0)`.

Lean knows that shorthand. An equation whose two sides are the same number written two ways is settled by **rfl**, the move from Level 0 that finishes an equation whose sides work out to the same thing.

```exercise
id: after-three
```

```exercise
id: two
```

The same holds for a number you do not know. Whatever n is, the one after it is what you would call n + 1. From here on the lessons write `n + 1`, and so, most of the time, does Lean.

```exercise
id: succ-is-plus-one
```

## Checking by working it out

Two more things follow from the definition. Numbers built differently are different: 3 is not 5. And any two particular numbers can be compared.

For claims like these about *particular* numbers there is a move that simply checks: **decide**. It works the claim out and reports whether it is true. It is not `rfl`, which only finishes an equation. Try `rfl` on the next one if you want to see Lean say so.

```exercise
id: not-equal
```

```exercise
id: less
```

`decide` needs particular numbers. A claim with a letter in it, such as "n + 1 is not 0", is a claim about every number at once, and there is nothing to work out. It needs a reason.

## The first named fact

The reason here is part of what a natural number is: zero is not the one after anything. Lean's library has this as a proved theorem with a name, `Nat.succ_ne_zero`. Read the name as "the successor is not equal to zero"; `ne` is short for "not equal".

A named theorem is used like a fact on the board. This one is a for-all: `Nat.succ_ne_zero n` is the fact `n + 1 ≠ 0` for your particular n, and `exact` finishes with it.

```exercise
id: never-zero
```

## What you used

- A natural number is zero or the successor of a natural number.
- `rfl` when two sides are the same number written two ways.
- `decide` to check a claim about particular numbers.
- `exact Nat.succ_ne_zero n`: a theorem from the library, used by name.
