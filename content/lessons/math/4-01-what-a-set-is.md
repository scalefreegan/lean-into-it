---
id: math-4-sets
title: What a set is
track: math
level: 4
order: 1
concepts: [sets]
summary: A set as the things that have a property; membership, subset, and a subset proved by taking a member.
exercises:
  - id: read-subset
    kind: read
    title: What subset says
    statement: "(A B : Set ℕ) : ∀ x, x ∈ A → x ∈ B"
    options:
      - Everything in A is also in B.
      - Everything in B is also in A.
      - Something is in both A and B.
      - A and B have the same members.
    solution: Everything in A is also in B.
    why: For every x, if x is in A then x is in B. It says nothing about the members of B that are not in A, and it does not say that A has any members at all.
  - id: use-subset
    title: Use a subset
    mode: typed
    says: If A is a subset of B and x is in A, then x is in B.
    statement: "(A B : Set ℕ) (x : ℕ) (hAB : A ⊆ B) (hx : x ∈ A) : x ∈ B"
    forbid: [grind, aesop, simp_all, tauto, exact?, apply?, hint, solve_by_elim, order, tauto_set, bound, grw, rw?]
    solution: |
      exact hAB hx
  - id: take-a-member
    kind: predict
    title: Take a member
    says: The first step of a proof that A is a subset of C.
    statement: "(A B C : Set ℕ) (hAB : A ⊆ B) (hBC : B ⊆ C) : A ⊆ C"
    move: intro x hx
    options:
      - "A B C : Set ℕ\nhAB : A ⊆ B\nhBC : B ⊆ C\nx : ℕ\nhx : x ∈ A\n⊢ x ∈ C"
      - "A B C : Set ℕ\nhAB : A ⊆ B\nhBC : B ⊆ C\nx : ℕ\nhx : x ∈ C\n⊢ x ∈ A"
      - "A B C : Set ℕ\nhAB : A ⊆ B\nhBC : B ⊆ C\nx : ℕ\nhx : x ∈ A\n⊢ x ∈ B"
    solution: "A B C : Set ℕ\nhAB : A ⊆ B\nhBC : B ⊆ C\nx : ℕ\nhx : x ∈ A\n⊢ x ∈ C"
  - id: subset-trans
    title: A subset of a subset
    mode: typed
    says: If A is a subset of B and B is a subset of C, then A is a subset of C.
    statement: "(A B C : Set ℕ) (hAB : A ⊆ B) (hBC : B ⊆ C) : A ⊆ C"
    forbid: [grind, aesop, simp_all, tauto, exact?, apply?, hint, solve_by_elim, order, trans, calc, subset_trans, Subset.trans, Set.Subset.trans, HasSubset.Subset.trans, hAB.trans, le_trans, tauto_set, bound, grw, rw?, transitivity, trans', le_trans', ge_trans, ge_trans']
    solution: |
      intro x hx
      apply hBC
      exact hAB hx
  - id: fours-in-twos
    title: Multiples of four
    mode: typed
    says: Every multiple of 4 is a multiple of 2.
    statement: ": {n : ℕ | ∃ k, n = 4 * k} ⊆ {n : ℕ | ∃ k, n = 2 * k}"
    forbid: [grind, aesop, simp_all, tauto, omega, exact?, apply?, hint, tauto_set, rw?]
    solution: |
      intro n hn
      obtain ⟨k, hk⟩ := hn
      use 2 * k
      rw [hk]
      ring
  - id: twos-in-fours
    kind: truefalse
    title: And the other way round
    says: Every multiple of 2 is a multiple of 4.
    statement: "(n : ℕ) : n ∈ {m : ℕ | m % 2 = 0} → n ∈ {m : ℕ | m % 4 = 0}"
    truth: false
    why: 2 is a multiple of 2 and not a multiple of 4. One member that is in the first set and not in the second is enough.
    counterexample: "2"
---

Until now the things you have proved claims about came one at a time: a number, a proposition, a list. This level adds a new kind of object, one that lets you speak of many things at once: the **set**.

A set is settled by one question, asked of each thing in turn: is it in, or not? The set of even numbers is settled because, for each number, you can say what it would mean for it to be in: it is even. A set has no order, and nothing is in it twice. Its members are all there is to it.

We write x ∈ A for "x is in A", and say that x is a **member** of A. A set is often written by naming the property its members have: `{n | Even n}`{say: the set of all n such that n is even}, read "the set of all n such that n is even".

## A picture

Draw a set as a circle. What is inside is in the set, and what is outside is not. Two circles, overlapping, show every way a thing can sit with respect to two sets: in both, in one, in the other, in neither.

```widget
type: set-diagram
formula: A
sets: [A, B]
caption: "The set A, whichever side of B its members fall."
```

## Subset

A is a **subset** of B, written A ⊆ B, when everything in A is also in B. In the picture, the part of A outside B has nothing in it:

```widget
type: set-diagram
formula: A
empty: 'A \ B'
caption: "A ⊆ B: what is left of A lies inside B."
```

Say the definition slowly: *for every x, if x is in A then x is in B.* That is a "for all" with an "if… then" inside it, and you have known since Level 1 how to prove one and how to use one.

```exercise
id: read-subset
```

## Using a subset

Suppose you know A ⊆ B, and you have some x with x ∈ A. Then x ∈ B. The fact `hAB : A ⊆ B` can be used just as an "if… then" is used: give it a proof that x is in A, and it gives back a proof that x is in B.

```exercise
id: use-subset
```

## Proving a subset

To prove A ⊆ C, you must deal with every member of A at once. The way to do that is the way to prove any "for all": **take one, and assume nothing about it except that it is in A.**

> Let x be in A. … Therefore x is in C.

In Lean, `intro x hx` does it. The goal A ⊆ C does not look like a "for all", but that is what it means, and `intro` sees through it.

```exercise
id: take-a-member
```

The state you have just found is the whole method in one picture. What you hold is a member of A, and what you want is that it belongs to C:

```widget
type: proof-state
state: |
  A B C : Set ℕ
  hAB : A ⊆ B
  hBC : B ⊆ C
  x : ℕ
  hx : x ∈ A
  ⊢ x ∈ C
caption: "Follow x: it starts in A."
```

Where does x go from there? Into B, and then into C. Mathematicians call this **chasing** an element.

```exercise
id: subset-trans
```

## Sets given by a property

When a set is given by a property, being a member means having the property. If you know that n is in `{n | ∃ k, n = 4 * k}`{say: the set of all n such that n is 4 times some k}, you know that n = 4k for some k, and `obtain` will take that k out. If you must show that n is in `{n | ∃ k, n = 2 * k}`{say: the set of all n such that n is 2 times some k}, you must find a number to double, and `use` will offer it.

```exercise
id: fours-in-twos
```

## When it is not a subset

To show that A is *not* a subset of B, one thing is enough: a member of A that is not in B. It is the counterexample you met in Level 1, seen from a new side.

```exercise
id: twos-in-fours
```

## What you used

- x ∈ A says that x is a member of A.
- A ⊆ B says that for every x, if x ∈ A then x ∈ B.
- To prove A ⊆ B, take a member: `intro x hx`. Then show x ∈ B.
- To use `hAB : A ⊆ B`, give it a member: `hAB hx`.
- To show A is not a subset of B, find one member of A that is not in B.
