---
id: logic-1-there-exists
title: There exists
track: logic
level: 1
order: 7
concepts: [exists]
summary: To prove that something exists, show one. To use the fact that something exists, give it a name and work with it. The move use, and obtain once more.
exercises:
  - id: show-one
    title: Show one
    mode: board
    says: There is a natural number n with n + 3 = 5.
    statement: ": ∃ n : ℕ, n + 3 = 5"
    moves: [use]
    solution: |
      use 2
  - id: a-square
    title: Find it yourself
    mode: board
    says: There is a natural number n whose square is 49.
    statement: ": ∃ n : ℕ, n * n = 49"
    moves: [use]
    solution: |
      use 7
  - id: two-things
    title: Then show it works
    mode: board
    says: There is an even natural number greater than 10.
    statement: ": ∃ n : ℕ, n > 10 ∧ Even n"
    moves: [use, constructor, norm_num]
    solution: |
      use 12
      constructor
      norm_num
      norm_num
  - id: from-a-fact
    title: A witness from your facts
    mode: board
    says: Suppose 4 has the property P. Then some natural number has P.
    statement: "(P : ℕ → Prop) (h4 : P 4) : ∃ n, P n"
    moves: [use, exact]
    solution: |
      use 4
  - id: pass-it-on
    title: Use one
    mode: board
    says: Suppose some natural number has P, and that every number with P has Q. Then some natural number has Q.
    statement: "(P Q : ℕ → Prop) (h : ∃ n, P n) (hPQ : ∀ n, P n → Q n) : ∃ n, Q n"
    moves: [apply, exact, obtain, use]
    solution: |
      obtain ⟨n, hn⟩ := h
      use n
      apply hPQ
      exact hn
  - id: typed
    title: Now type one
    mode: typed
    says: There is a natural number strictly between 2 and 4.
    statement: ": ∃ n : ℕ, 2 < n ∧ n < 4"
    forbid: [tauto, aesop, simp, simp_all, grind, itauto, exact?, apply?, decide]
    solution: |
      use 3
      constructor
      norm_num
      norm_num
---

"**There is** a prime number greater than a million." "The equation **has** a solution." These claim that at least one thing of some kind exists. Logicians write `∃ x, …`, read "there exists x such that".

## Proving that something exists

The most direct way to prove that something exists is to **show one**. The thing you show is called a *witness*. The move is **use**: you tell Lean your witness, and the goal becomes "check that it works".

This is the first move where you type something. Click **use**, type the number, and press Enter.

```exercise
id: show-one
```

It finished at once. After `use`, Lean tries a few easy ways to finish what is left, such as plain calculation, and here that was enough.

Lean checks the witness. It does not find it. Finding it is your part.

```exercise
id: a-square
```

Try a wrong witness there, if you did not: `use 6` is accepted as a move, and leaves you the goal `6 * 6 = 49`, which is false and cannot be proved. A wrong witness is not an error, only a dead end. **Undo** gets you out.

When the claim about the witness has parts, something is left for you to do. `Even n` is how Mathlib says that n is even, and **norm_num** from Level 0 can check it for a particular number.

```exercise
id: two-things
```

The witness does not have to be clever. Often your facts tell you what it is.

```exercise
id: from-a-fact
```

## Using the fact that something exists

Now suppose you *know* `h : ∃ n, P n`. Something with P exists, but you are not told which number it is. A mathematician says: *"Let n be such a number."* From then on there is an n to work with, and one fact about it: that it has P. Nothing else is known about n.

The move is **obtain**, for the third time. It writes `obtain ⟨n, hn⟩ := h`: from h, obtain the thing `n` and the fact about it `hn`.

```exercise
id: pass-it-on
```

There the witness you gave to `use` was not a number but the `n` you had just obtained. A witness can be anything on the board.

## Compare with for-all

Put the two side by side and they mirror each other.

| | to prove it | to use it |
|---|---|---|
| for all x | take an arbitrary x: you do not choose | apply it to a particular x: you choose |
| there exists x | give a witness: you choose | get some x: you do not choose |

## Typing it yourself

```exercise
id: typed
```

## What you used

- `use 7` to prove `∃ n, …`: give the witness; what remains is that it works.
- `obtain ⟨n, hn⟩ := h` to use `h : ∃ n, …`: an n, and the fact `hn` about it.
