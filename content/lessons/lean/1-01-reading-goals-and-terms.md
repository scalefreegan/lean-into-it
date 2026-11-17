---
id: lean-1-goals-and-terms
title: Reading a goal, and proofs as things
track: lean
level: 1
order: 1
concepts: [goal-state, proofs-as-terms]
summary: How to read what Lean prints, line by line, and the idea underneath it all, that a proof is a thing you can build, name and hand over like a number.
exercises:
  - id: feed-it
    title: Give a function its input
    mode: typed
    says: Suppose P is true, and suppose that if P then Q. Then Q is true.
    statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q"
    forbid: &moves [intro, apply, constructor, obtain, rcases, cases, left, right, exfalso, contradiction, by_contra, tauto, aesop, simp, simp_all, grind, itauto, exact?, apply?, decide]
    solution: |
      exact hPQ hP
  - id: one-case
    title: Give a for-all its case
    mode: typed
    says: Suppose f(x) is at least 0 for every real number x. Then f(2) is at least 0.
    statement: "(f : ℝ → ℝ) (hf : ∀ x, f x ≥ 0) : f 2 ≥ 0"
    forbid: *moves
    solution: |
      exact hf 2
  - id: a-pair
    title: Build a pair
    mode: typed
    says: Suppose P is true and Q is true. Then P and Q.
    statement: "(P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q"
    forbid: *moves
    solution: |
      exact ⟨hP, hQ⟩
  - id: second-part
    title: Take the second part
    mode: typed
    says: Suppose P and Q. Then Q.
    statement: "(P Q : Prop) (h : P ∧ Q) : Q"
    forbid: *moves
    solution: |
      exact h.2
  - id: swap
    title: Both together
    mode: typed
    says: Suppose P and Q. Then Q and P.
    statement: "(P Q : Prop) (h : P ∧ Q) : Q ∧ P"
    forbid: *moves
    solution: |
      exact ⟨h.2, h.1⟩
  - id: write-a-function
    title: Write a function
    mode: typed
    says: If P, then P.
    statement: "(P : Prop) : P → P"
    forbid: *moves
    solution: |
      exact fun hP => hP
  - id: chain
    title: A chain, in one line
    mode: typed
    says: Suppose that if P then Q, and that if Q then R. Then if P then R.
    statement: "(P Q R : Prop) (hPQ : P → Q) (hQR : Q → R) : P → R"
    forbid: *moves
    solution: |
      exact fun hP => hQR (hPQ hP)
---

The logic lessons have been showing you Lean's goal state as cards. Underneath, Lean prints it as plain text, and that text is what you will see in any other Lean tool, in books, and in answers online. This lesson reads it once, slowly. Then it looks at the one idea that explains why it is written that way.

## Reading a goal state

Here is what Lean prints at the start of an exercise from the lesson on if-then:

```lean
P Q R : Prop
hPQ : P → Q
hQR : Q → R
⊢ P → R
```

Every line above the last has the form **name : what it is**.

- `P Q R : Prop` introduces three **objects**. `Prop` is short for *proposition*: P, Q and R are statements, each of which may be true or false. Several names can share a line when they are the same kind of thing. Elsewhere you have seen `x : ℕ`, "x is a natural number", and `f : ℝ → ℝ`, "f is a function from real numbers to real numbers".
- `hPQ : P → Q` is a **fact**: something assumed or already shown. The name is on the left, the statement on the right. Lean calls these *hypotheses*. The names starting with h are only a habit.
- `⊢ P → R` is the **goal**. The symbol `⊢` is called a turnstile; read it as "to show".

The board puts the objects in one row, the facts on teal cards and the goal on an amber card. It is the same information.

When there is more than one goal, Lean prints one such block for each, and each has its own facts above its own `⊢`. A label may come first, such as `case inl` after you split an or. Your next line always works on the first goal. When there are none left, the proof is done.

## The colon means the same thing every time

Look again at these two lines.

```lean
x : ℕ
hP : P
```

The first says x is a natural number. The second, read the same way, says: **hP is a proof of P**. That is how Lean means it. A statement is treated as a kind of thing, and its proofs are the things of that kind. `ℕ` has many members: 0, 1, 2 and so on. A true statement has a proof as a member. `False` has none.

Lean calls the right-hand side of the colon a **type**, and the thing on the left a **term** of that type. This is the idea called *propositions as types*, and it has a practical consequence: proofs are things. You can name them, pass them to functions, and put them in pairs, and each way of proving from the logic lessons turns out to be an ordinary way of building things.

In this lesson the moves you know are switched off. Every proof is a single line, `exact` followed by the thing itself, built by hand.

## An if-then is a function

A proof of `P → Q` is a **function**: give it a proof of P and it returns a proof of Q. So if you have `hPQ : P → Q` and `hP : P`, then `hPQ hP`, the function applied to its input, is a proof of Q. Lean writes a function next to its input with a space between, no brackets.

```exercise
id: feed-it
```

A for-all is a function too: give `hf : ∀ x, f x ≥ 0` a number, and it returns the fact about that number.

```exercise
id: one-case
```

## An and is a pair

A proof of `P ∧ Q` is a **pair**: a proof of P together with a proof of Q. You build one with the angle brackets, `⟨hP, hQ⟩`. Type `\<` and `\>`, each followed by a space.

```exercise
id: a-pair
```

And you take a pair apart by asking for its first or second part: `h.1` and `h.2`.

```exercise
id: second-part
```

```exercise
id: swap
```

## Writing a function yourself

To prove an if-then from nothing, you write the function. Lean's way of writing "the function that takes x and returns …" is `fun x => …`. So `fun hP => hP` takes a proof of P and gives it straight back, and that is a proof of `P → P`.

```exercise
id: write-a-function
```

Brackets group things as in arithmetic: `hQR (hPQ hP)` applies `hPQ` to `hP` first, and `hQR` to the result.

```exercise
id: chain
```

## Moves and terms are the same proof

Compare what you just typed with the board proof of the same statement:

```lean
intro hP
apply hQR
apply hPQ
exact hP
```

`intro hP` is `fun hP =>`. Each `apply` is a function waiting for its input, and `exact hP` supplies the innermost one. The moves, which Lean calls **tactics**, are instructions for building the term, and Lean builds it behind the scenes as you go. What it finally checks is always the term.

Neither style is better. Tactics are easier when you are finding a proof, because you can watch the goal change. Terms are shorter when you can already see the whole proof. Real Lean mixes the two freely, and from now on you may too: `exact hPQ hP` is welcome in any typed exercise.

## What you used

- `name : type` is read "name is a …" for objects and "name is a proof of …" for facts.
- `hPQ hP`: a proof of an if-then is a function; apply it to a proof of its "if" part.
- `hf 2`: a proof of a for-all is a function; apply it to the particular thing.
- `⟨hP, hQ⟩` builds a proof of an and; `h.1` and `h.2` are its parts.
- `fun hP => …` writes a proof of an if-then directly.
