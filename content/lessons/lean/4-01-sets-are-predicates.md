---
id: lean-4-sets-are-predicates
title: Sets are predicates
track: lean
level: 4
order: 2
concepts: [sets]
summary: "In Lean a set is a property: x ∈ {n | n > 2} unfolds to x > 2, and rintro takes a member apart in one line."
exercises:
  - id: in-means-has
    title: Membership is the property
    mode: typed
    says: For any property p of natural numbers, x is in the set of all n with p n exactly when p x holds.
    statement: "(p : ℕ → Prop) (x : ℕ) : x ∈ {n | p n} ↔ p x"
    solution: |
      rfl
  - id: five-is-in
    title: Show the goal another way
    mode: typed
    says: 5 is in the set of natural numbers greater than 2.
    statement: ": 5 ∈ {n : ℕ | n > 2}"
    solution: |
      show 5 > 2
      norm_num
  - id: change-a-fact
    kind: predict
    title: Change a fact
    says: The fact is a membership, and change writes it as the property.
    statement: "(a : ℕ) (ha : a ∈ {n : ℕ | n > 2}) : a + 1 ∈ {n : ℕ | n > 3}"
    move: change a > 2 at ha
    options:
      - "a : ℕ\nha : a > 2\n⊢ a + 1 ∈ {n | n > 3}"
      - "a : ℕ\nha : a > 2\n⊢ a + 1 > 3"
      - "a : ℕ\nha : a ∈ {n | n > 2}\n⊢ a + 1 > 3"
    solution: "a : ℕ\nha : a > 2\n⊢ a + 1 ∈ {n | n > 3}"
  - id: one-more
    title: Let omega see
    mode: typed
    says: If a is in the set of numbers greater than 2, then a + 1 is in the set of numbers greater than 3.
    statement: "(a : ℕ) (ha : a ∈ {n : ℕ | n > 2}) : a + 1 ∈ {n : ℕ | n > 3}"
    solution: |
      change a > 2 at ha
      show a + 1 > 3
      omega
  - id: take-apart
    kind: predict
    title: Two steps in one
    says: Every multiple of 6 is a multiple of 3. The first step takes a member, and takes it apart.
    statement: ": {n : ℕ | ∃ k, n = 6 * k} ⊆ {n : ℕ | ∃ k, n = 3 * k}"
    move: rintro n ⟨k, hk⟩
    options:
      - "n k : ℕ\nhk : n = 6 * k\n⊢ n ∈ {n | ∃ k, n = 3 * k}"
      - "n : ℕ\nhk : n ∈ {n | ∃ k, n = 6 * k}\n⊢ n ∈ {n | ∃ k, n = 3 * k}"
      - "n k : ℕ\nhk : n = 6 * k\n⊢ n = 3 * k"
    solution: "n k : ℕ\nhk : n = 6 * k\n⊢ n ∈ {n | ∃ k, n = 3 * k}"
  - id: sixes-in-threes
    title: Multiples of six
    mode: typed
    says: Every multiple of 6 is a multiple of 3.
    statement: ": {n : ℕ | ∃ k, n = 6 * k} ⊆ {n : ℕ | ∃ k, n = 3 * k}"
    forbid: [grind, aesop, simp_all, tauto, tauto_set, aesop_cat, cat_disch, exact?, apply?, rw?, hint]
    solution: |
      rintro n ⟨k, hk⟩
      use 2 * k
      omega
  - id: one-of-two
    title: Keep half of it
    mode: typed
    says: Every number greater than 2 and less than 10 is less than 10.
    statement: ": {n : ℕ | n > 2 ∧ n < 10} ⊆ {n : ℕ | n < 10}"
    forbid: [grind, aesop, simp, simp_all, simpa, norm_num, bound, tauto, tauto_set, aesop_cat, cat_disch, exact?, apply?, rw?, hint]
    solution: |
      rintro n ⟨h2, h10⟩
      exact h10
  - id: either-way
    kind: fill
    title: A member that is one of two things
    says: If n is 2 or 4, then n is even.
    statement: ": {n : ℕ | n = 2 ∨ n = 4} ⊆ {n : ℕ | Even n}"
    proof: |
      rintro n <gap>
      · rw [h]
        use 1
      · rw [h]
        use 2
    options:
      - "⟨h, h⟩"
      - (h | h)
    solution: (h | h)
---

The last lesson spoke of a set as settled by one question: is it in, or not? Lean takes that at its word. A set of natural numbers *is* a property of natural numbers, a thing that takes a number and gives a proposition. Such a property is called a **predicate**, and you have met them since Level 1 as `p : ℕ → Prop`{say: p, from the natural numbers to propositions}.

## Membership is the property

Writing `{n | p n}`{say: the set of all n such that p of n} makes a set out of the property p. To say that x is in it is to say that p holds of x, and nothing more. The two are not merely equivalent: they are the same proposition written in two ways, so `rfl` proves it.

```exercise
id: in-means-has
```

This is why `exact` and `intro` worked so easily in the last lesson. They look past how a thing is written to what it means.

## Writing it the other way

You can ask Lean to write the goal out. **`show`** followed by a proposition replaces the goal with that proposition, provided the two mean the same by definition. Here the goal is a membership, and you can show it as an inequality.

```exercise
id: five-is-in
```

For a fact the move is **`change`**: `change a > 2 at ha` writes the fact `ha` as `a > 2`. Both refuse if the new form does not mean the same.

```exercise
id: change-a-fact
```

## When it matters

Some tactics do not look past the writing. `omega` knows about inequalities of whole numbers, but a membership is not written as one, so it does not see the inequality inside. Write both the fact and the goal as inequalities, and it does.

```exercise
id: one-more
```

When a tactic that ought to work says it found nothing to use, look for a membership in the way.

## Taking a member apart

To prove a subset you take a member with `intro n hn`, and when membership means "there is a k", you take that apart with `obtain ⟨k, hk⟩ := hn`. The two go together so often that Lean has one move for both. **`rintro`** is `intro` with the pattern of an `obtain` written where the name would go: `rintro n ⟨k, hk⟩`.

```exercise
id: take-apart
```

```widget
type: proof-state
state: |
  n k : ℕ
  hk : n = 6 * k
  ⊢ n ∈ {n | ∃ k, n = 3 * k}
caption: "After rintro n ⟨k, hk⟩: the member is already in pieces."
```

The goal is still written as a membership. That is no trouble: `use` looks past the writing, and asks what the number is.

```exercise
id: sixes-in-threes
```

An "and" comes apart with the same angle brackets, one name for each half.

```exercise
id: one-of-two
```

An "or" does not give you both halves, so it has a pattern of its own: round brackets, with a bar between the two cases. It leaves two goals, one for each.

```exercise
id: either-way
```

## What you used

- A set in Lean is a predicate: x ∈ `{n | p n}`{say: the set of all n such that p of n} means p x, by definition.
- `show` writes the goal, and `change … at` a fact, in another form with the same meaning.
- `rintro n ⟨k, hk⟩` takes a member and takes it apart. Use `⟨ , ⟩` for "there exists" and "and", and `( | )`{say: round brackets with a bar} for "or".
