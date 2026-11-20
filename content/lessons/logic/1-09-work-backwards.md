---
id: logic-1-work-backwards
title: Work backwards
track: logic
level: 1
order: 9
craft: true
concepts: [implication, and, exists]
summary: When you do not know the first step, start at the goal. Ask which fact could end in it, and what you would need for that.
exercises:
  - id: predict-apply
    kind: predict
    title: Predict the new goal
    concept: implication
    says: Using an if-then whose conclusion is the goal.
    statement: "(P Q R S A B : Prop) (hP : P) (hPA : P → A) (hAB : A → B) (hPQ : P → Q) (hQR : Q → R) (hRS : R → S) : S"
    move: apply hRS
    options:
      - "P Q R S A B : Prop\nhP : P\nhPA : P → A\nhAB : A → B\nhPQ : P → Q\nhQR : Q → R\nhRS : R → S\n⊢ R"
      - "P Q R S A B : Prop\nhP : P\nhPA : P → A\nhAB : A → B\nhPQ : P → Q\nhQR : Q → R\nhRS : R → S\n⊢ S"
      - "P Q R S A B : Prop\nhP : P\nhPA : P → A\nhAB : A → B\nhPQ : P → Q\nhQR : Q → R\nhRS : R → S\n⊢ Q"
    solution: "P Q R S A B : Prop\nhP : P\nhPA : P → A\nhAB : A → B\nhPQ : P → Q\nhQR : Q → R\nhRS : R → S\n⊢ R"
  - id: the-chain
    title: Follow the chain back
    concept: implication
    mode: board
    says: Suppose P, that P gives A and A gives B, and that P gives Q, Q gives R and R gives S. Then S.
    statement: "(P Q R S A B : Prop) (hP : P) (hPA : P → A) (hAB : A → B) (hPQ : P → Q) (hQR : Q → R) (hRS : R → S) : S"
    moves: [apply, exact]
    solution: |
      apply hRS
      apply hQR
      apply hPQ
      exact hP
  - id: pieces
    title: Break the goal into pieces
    concept: exists
    mode: board
    says: Suppose 3 has the property P, and that every number with P has Q. Then some number has both Q and P.
    statement: "(P Q : ℕ → Prop) (h3 : P 3) (hPQ : ∀ n, P n → Q n) : ∃ m, Q m ∧ P m"
    moves: [use, constructor, apply, exact]
    solution: |
      use 3
      constructor
      apply hPQ
      exact h3
      exact h3
  - id: typed
    title: Now type one
    concept: implication
    mode: typed
    says: Suppose P gives both Q and R, and R gives S. Then P gives S.
    statement: "(P Q R S : Prop) (hPQR : P → Q ∧ R) (hRS : R → S) : P → S"
    forbid: [tauto, aesop, simp, simp_all, grind, itauto, exact?, apply?, decide]
    solution: |
      intro hP
      apply hRS
      obtain ⟨hQ, hR⟩ := hPQR hP
      exact hR
---

Sometimes you look at a claim and do not know how to begin. The facts are there, the goal is there, and no first step is obvious. This lesson is about what to do then. It is not a new move. It is a habit, and mathematicians use it all the time.

The habit: **start from the goal, not from the facts.** You took a step backwards with `apply` in the lesson on if-then. Here it becomes a way to find a proof when the facts give you more than one road.

## The problem

Suppose `P` is true, and each of these holds: `P` gives `A`, `A` gives `B`, `P` gives `Q`, `Q` gives `R`, `R` gives `S`. Show `S`.

```widget
type: proof-state
state: |
  P Q R S A B : Prop
  hP : P
  hPA : P → A
  hAB : A → B
  hPQ : P → Q
  hQR : Q → R
  hRS : R → S
  ⊢ S
caption: Six facts, and a goal that none of them is.
```

Going forwards, two roads leave `P`: `hPA` and `hPQ`. One runs to `A`, then `B`, and stops there; the other reaches `S`. From the start you cannot tell which, so you would have to try. Here there are six facts; in a real proof there may be dozens. Going backwards, there is nothing to guess.

## Read the goal

The goal is `S`. Do not touch the facts yet. Ask one question: **which fact could end in S?**

Only one: `hRS : R → S`. Its conclusion is the goal. So if we had `R`, we would be done. That is the whole step. We have not proved anything, but we have changed the question: instead of "how do I get S?" it is now "how do I get R?"

The move is **apply**. Lean replaces the goal `S` with the thing you would need.

```exercise
id: predict-apply
```

The same question again. The goal is `R`. Which fact ends in `R`? `hQR`. Then the goal is `Q`. Which fact ends in `Q`? `hPQ`. Then the goal is `P`, and `hP` is exactly that.

```exercise
id: the-chain
```

Read it from the bottom up and it is the mathematician's proof: "We have P. P gives Q, so Q. Q gives R, so R. R gives S, so S." You found it in the other order, and wrote it down in this one.

## What the goal tells you

Each kind of goal has its own question.

- **`A → B`**: assume A, and aim for B. (`intro`.)
- **`A ∧ B`**: you need both, so split it into two goals. (`constructor`.)
- **`∃ x, …`**: you need a witness. Look at your facts for one. (`use`.)
- **a plain statement `S`**: which fact ends in `S`? (`apply`.)

When a goal has several pieces, take them one at a time. Each piece is a smaller problem of the same kind.

```exercise
id: pieces
```

Here the goal asked for a number with two properties. The facts only mention `3`, so `3` was the witness. Then the goal split in two, and one piece needed `hPQ` and the other did not.

## When you are stuck

Going backwards is also what to do when a proof stalls. Try these in turn.

1. **Read the goal again.** Say it in words. What kind of statement is it?
2. **List what you have.** Look at every fact. Which ones mention things in the goal?
3. **Ask what could end in this goal.** Which fact, or which rule, has this goal as its conclusion?
4. **Try a smaller case.** Put in a particular number, or drop one of the conditions, and see what you would do there.
5. **Write down what you would need.** Even if you cannot get it yet. A goal you can state is a goal you can work on, and it may turn out to be one of your facts.

Nothing here is guaranteed to work, but each step makes the problem smaller or clearer.

## Typing it yourself

This one has an if-then goal and a fact with an *and* inside. Start with what the goal asks: `P → S` begins with `intro`. After that, which fact ends in `S`? When you reach a fact you cannot use whole, take it apart.

```exercise
id: typed
```

## What you used

- Start at the goal and ask which fact ends in it. `apply` that fact, and the goal becomes what it needs.
- Repeat until the goal is one of your facts: `exact`.
- Each kind of goal says what to do: `intro` for an if-then, `constructor` for an and, `use` for an exists.
- When stuck: read the goal, list what you have, ask what could end in it, try a smaller case, write down what you would need.
