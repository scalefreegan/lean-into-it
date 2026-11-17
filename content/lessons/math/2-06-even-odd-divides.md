---
id: math-2-divisibility
title: Even, odd, divides
track: math
level: 2
order: 6
concepts: [divisibility]
summary: What it means for a number to be even, to be odd, or to divide another. Each is a "there exists" in disguise, so the moves from Level 1 prove them and use them.
exercises:
  - id: divides
    title: 3 divides 12
    mode: board
    says: 3 divides 12.
    statement: ": 3 ∣ 12"
    moves: [use, decide]
    solution: |
      use 4
  - id: even
    title: 10 is even
    mode: board
    says: 10 is even.
    statement: ": Even 10"
    moves: [use, rfl]
    solution: |
      use 5
  - id: odd
    title: 7 is odd
    mode: board
    says: 7 is odd.
    statement: ": Odd 7"
    moves: [use, rfl]
    solution: |
      use 3
      rfl
  - id: not-divides
    title: 3 does not divide 10
    mode: board
    says: 3 does not divide 10.
    statement: ": ¬ (3 ∣ 10)"
    moves: [use, decide]
    solution: |
      decide
  - id: next-even
    title: Two more is still even
    mode: board
    says: Suppose n is even. Then n + 2 is even.
    statement: "(n : ℕ) (h : Even n) : Even (n + 2)"
    moves: [obtain, use, omega]
    solution: |
      obtain ⟨r, hr⟩ := h
      use r + 1
      omega
  - id: odd-plus-one
    title: One more than odd
    mode: board
    says: Suppose n is odd. Then n + 1 is even.
    statement: "(n : ℕ) (h : Odd n) : Even (n + 1)"
    moves: [obtain, use, omega]
    solution: |
      obtain ⟨k, hk⟩ := h
      use k + 1
      omega
  - id: even-plus-even
    title: Now type one
    mode: typed
    says: Suppose a and b are even. Then a + b is even.
    statement: "(a b : ℕ) (ha : Even a) (hb : Even b) : Even (a + b)"
    forbid: [Even.add, ha.add, Nat.even_add, parity_simps, simp, simp_all, aesop, grind, tauto, exact?, apply?, decide]
    solution: |
      obtain ⟨r, hr⟩ := ha
      obtain ⟨s, hs⟩ := hb
      use r + s
      omega
  - id: divides-chain
    title: Divides, twice over
    mode: typed
    says: Suppose a divides b, and b divides c. Then a divides c.
    statement: "(a b c : ℕ) (hab : a ∣ b) (hbc : b ∣ c) : a ∣ c"
    forbid: [dvd_trans, Nat.dvd_trans, Dvd.dvd.trans, hab.trans, Dvd.dvd.mul_right, simp, simp_all, aesop, grind, tauto, exact?, apply?, decide, omega]
    solution: |
      obtain ⟨k, hk⟩ := hab
      obtain ⟨m, hm⟩ := hbc
      use k * m
      rw [hm, hk, Nat.mul_assoc]
---

"10 is even." "3 divides 12." These are claims you can check in your head. The question for this lesson is what they *say*, exactly, because that decides how they are proved.

## Divides

> **a divides b** means: there is a number c with b = a × c.

So "3 divides 12" is a "there exists" statement, and you know how to prove one of those: show the thing. Here the thing is 4, since 12 = 3 × 4. The move is **use**, from the lesson on there-exists.

Lean writes "divides" with the bar `∣`, as in `3 ∣ 12`. It is not the bar on your keyboard: type `\|` then a space. Mind the order. `3 ∣ 12` is true, and `12 ∣ 3` is not.

```exercise
id: divides
```

## Even and odd

> **n is even** means: there is a number r with n = r + r.
>
> **n is odd** means: there is a number k with n = 2 × k + 1.

Again each is a "there exists", proved with **use**. Lean writes them `Even n` and `Odd n`.

```exercise
id: even
```

After `use`, Lean tries to finish what is left by `rfl`, and for "10 = 5 + 5" that works. For odd numbers it leaves the check to you.

```exercise
id: odd
```

## Saying no

"3 does not divide 10" says that *no* number c gives 10 = 3 × c. There is no witness to show. But the claim is about particular numbers, and for those Lean can check every candidate itself: **decide**.

```exercise
id: not-divides
```

## Using one

Now the other direction. Suppose you *know* that n is even. That fact is a "there exists", and a fact of that kind is taken apart with **obtain**: you get the number r, and the fact `hr : n = r + r`.

Then to show that n + 2 is even, you need a witness for it. If n is r + r, what number added to itself gives n + 2?

```exercise
id: next-even
```

After the witness, the goal was `n + 2 = r + 1 + (r + 1)`, with `hr : n = r + r` on the board. That is plain arithmetic, and **omega** finishes it using `hr`.

The same pattern does the next one: take the fact apart, give the witness, let `omega` do the arithmetic.

```exercise
id: odd-plus-one
```

> The pattern for facts about even, odd and divides: **obtain** the number each fact promises, **use** the number the goal needs, then arithmetic.

## Typing it yourself

Two evens make an even. Each fact gives you its own number; choose different names for them.

```exercise
id: even-plus-even
```

The last one has multiplication of letters in it, which `omega` cannot do, so the arithmetic is by rewriting. After you give the witness, rewrite with the two facts you obtained. What is left is that brackets in a product can be moved: `Nat.mul_assoc` says a × b × c = a × (b × c).

```exercise
id: divides-chain
```

## What you used

- `a ∣ b`: there is a c with b = a × c. `Even n`: there is an r with n = r + r. `Odd n`: there is a k with n = 2 × k + 1.
- `use` to prove one, by giving the number.
- `obtain ⟨r, hr⟩ := h` to use one: the number, and the equation about it.
- `decide` for a "does not divide" between particular numbers.
