---
id: math-4-set-operations
title: Union, intersection, complement
track: math
level: 4
order: 2
concepts: [set-operations]
summary: Each operation is a logical connective in disguise, and each proof uses the moves of Level 1.
exercises:
  - id: read-inter
    kind: read
    title: What intersection says
    statement: "(A B : Set ℕ) (x : ℕ) : x ∈ A ∩ B ↔ x ∈ A ∧ x ∈ B"
    options:
      - x is in A and x is in B.
      - x is in A or x is in B.
      - x is in A and not in B.
      - Everything in A is in B.
    solution: x is in A and x is in B.
    why: The intersection keeps what the two sets share, so to be in it is to be in both. That is an "and", and Lean takes it as exactly that.
  - id: inter-left
    title: Half of an intersection
    mode: typed
    says: The intersection of A and B is a subset of A.
    statement: "(A B : Set ℕ) : A ∩ B ⊆ A"
    forbid: &ops [norm_num, simp, simp_all, simpa, dsimp, decide, trivial, aesop, aesop_cat, cat_disch, grind, bound, tauto, tauto_set, solve_by_elim, observe, exact?, apply?, rw?, hint, inter_subset_left, inter_subset_right, subset_union_left, subset_union_right, inter_comm, union_comm, inter_subset_inter, union_subset_union, diff_subset, compl_union, compl_inter, inter_compl_self, compl_inter_self, subset_compl_compl, compl_compl, inf_le_left, inf_le_right, le_sup_left, le_sup_right, inf_comm, sup_comm, and_comm, or_comm, And.comm, Or.comm, And.symm, Or.symm, And.swap, Or.swap, not_or, compl_sup, disjoint_compl_right, inter_union_distrib_left, subset_inter, union_subset, symm, le_inf, sup_le, le_of_eq, inf_compl_eq_bot, inf_compl_self, compl_inf, inf_compl_le_bot, mem_union_left, mem_union_right, mem_of_mem_inter_left, mem_of_mem_inter_right, push_neg, push]
    solution: |
      intro x hx
      exact hx.1
  - id: go-left
    kind: predict
    title: Choose a side
    says: x is in A, and the goal is that x is in A ∪ B. The step chooses the left side of the "or".
    statement: "(A B : Set ℕ) (x : ℕ) (hx : x ∈ A) : x ∈ A ∪ B"
    move: left
    options:
      - "A B : Set ℕ\nx : ℕ\nhx : x ∈ A\n⊢ x ∈ A"
      - "A B : Set ℕ\nx : ℕ\nhx : x ∈ A\n⊢ x ∈ B"
      - "A B : Set ℕ\nx : ℕ\nhx : x ∈ A\n⊢ x ∈ A ∩ B"
    solution: "A B : Set ℕ\nx : ℕ\nhx : x ∈ A\n⊢ x ∈ A"
  - id: into-union
    title: Into a union
    mode: typed
    says: A is a subset of the union of A and B.
    statement: "(A B : Set ℕ) : A ⊆ A ∪ B"
    forbid: *ops
    solution: |
      intro x hx
      left
      exact hx
  - id: inter-swap
    title: Both, the other way round
    mode: typed
    says: The intersection of A and B is a subset of the intersection of B and A.
    statement: "(A B : Set ℕ) : A ∩ B ⊆ B ∩ A"
    forbid: *ops
    solution: |
      rintro x ⟨ha, hb⟩
      constructor
      · exact hb
      · exact ha
  - id: union-swap
    title: One or the other, the other way round
    mode: typed
    says: The union of A and B is a subset of the union of B and A.
    statement: "(A B : Set ℕ) : A ∪ B ⊆ B ∪ A"
    forbid: *ops
    solution: |
      rintro x (ha | hb)
      · right
        exact ha
      · left
        exact hb
  - id: nothing-in-both
    title: In A and not in A
    mode: typed
    says: Nothing is in both A and its complement.
    statement: "(A : Set ℕ) : A ∩ Aᶜ ⊆ ∅"
    forbid: *ops
    solution: |
      rintro x ⟨ha, hna⟩
      exact hna ha
  - id: outside-union
    title: Outside a union
    mode: typed
    says: What is outside the union of A and B is outside A and outside B.
    statement: "(A B : Set ℕ) : (A ∪ B)ᶜ ⊆ Aᶜ ∩ Bᶜ"
    forbid: *ops
    solution: |
      intro x hx
      constructor
      · intro ha
        apply hx
        left
        exact ha
      · intro hb
        apply hx
        right
        exact hb
  - id: union-in-inter
    kind: truefalse
    title: A union inside an intersection?
    says: Every number that is even or a multiple of 3 is both even and a multiple of 3.
    statement: "(n : ℕ) : n ∈ {m : ℕ | m % 2 = 0} ∪ {m : ℕ | m % 3 = 0} → n ∈ {m : ℕ | m % 2 = 0} ∩ {m : ℕ | m % 3 = 0}"
    truth: false
    why: 2 is even, so it is in the union, but it is not a multiple of 3, so it is not in the intersection. Being in one of two sets does not put a thing in both.
    counterexample: "2"
---

*What a set is* gave you sets one at a time. This lesson makes new sets out of old ones, in three ways. Each is a connective from Level 1 in disguise, and so each proof about them is a proof you already know how to write.

## Intersection: and

The **intersection** of A and B, written A ∩ B, is what the two sets share: x ∈ A ∩ B means x ∈ A **and** x ∈ B.

```widget
type: set-diagram
formula: A ∩ B
caption: "A ∩ B: the part where the circles overlap."
```

```exercise
id: read-inter
```

Compare the picture with the truth table of "and". The four regions of the picture, in both, in A only, in B only, in neither, are the four rows of the table, and only one is shaded, as only one row is true.

```widget
type: truth-table
formula: p ∧ q
steps: false
caption: "Read p as x ∈ A and q as x ∈ B: one row in four, one region in four."
```

To use a fact `hx : x ∈ A ∩ B`, use it as an "and": `hx.1` is the proof that x ∈ A, `hx.2` that x ∈ B, and `obtain ⟨ha, hb⟩ := hx` takes both. Lean sees the "and" inside the membership without being told.

```exercise
id: inter-left
```

## Union: or

The **union** of A and B, written A ∪ B, is everything in either: x ∈ A ∪ B means x ∈ A **or** x ∈ B.

```widget
type: set-diagram
formula: A ∪ B
caption: "A ∪ B: both circles, the overlap included."
```

To prove an "or", you choose the side you can prove, with `left` or `right`.

```exercise
id: go-left
```

```exercise
id: into-union
```

## Chasing a member through two sets

The method of *What a set is* still holds: take a member, follow it. What is new is only that the member now arrives with an "and" or an "or" to take apart, and leaves needing one to be built. Since *Sets are predicates* you can take it apart as it arrives: `rintro x ⟨ha, hb⟩`{say: R intro x, and in angle brackets h a, h b} for an "and", `rintro x (ha | hb)`{say: R intro x, and in brackets h a or h b} for an "or", which gives two cases.

```exercise
id: inter-swap
```

```exercise
id: union-swap
```

## Complement: not

The **complement** of A, written Aᶜ, is everything not in A: x ∈ Aᶜ means x ∉ A, that is, **not** x ∈ A.

```widget
type: set-diagram
formula: Aᶜ
sets: [A, B]
caption: "Aᶜ: everything outside A, B or not."
```

A "not" is an "if… then False", so a fact `hna : x ∈ Aᶜ` is used as you would use one: give it a proof that x ∈ A, and it gives False. And the empty set, ∅, has no members at all: x ∈ ∅ is False itself. So to prove that a set is a subset of ∅, take a member and reach a contradiction.

```exercise
id: nothing-in-both
```

The **difference** A \ B is what is in A and not in B: x ∈ A \ B means x ∈ A and x ∉ B. It is an intersection with a complement, A ∩ Bᶜ, under another name.

```widget
type: set-diagram
formula: 'A \ B'
against: A ∩ Bᶜ
```

## Outside a union

What is outside A ∪ B? Shade it yourself, then check.

```widget
type: set-diagram
formula: (A ∪ B)ᶜ
fill: true
```

It is the part outside both circles, which is outside A and outside B. Proving one half of that, (A ∪ B)ᶜ ⊆ Aᶜ ∩ Bᶜ, needs every move of this lesson: an "and" to build, two "not"s to prove, and an "or" to give to the fact that is a "not".

```exercise
id: outside-union
```

## Not every inclusion holds

Pictures suggest inclusions, and proofs settle them. When one fails, one member is enough to show it.

```exercise
id: union-in-inter
```

## What you used

- x ∈ A ∩ B means x ∈ A and x ∈ B: take it apart with `obtain ⟨ha, hb⟩`, build it with `constructor`.
- x ∈ A ∪ B means x ∈ A or x ∈ B: take it apart in two cases, build it with `left` or `right`.
- x ∈ Aᶜ means x ∉ A, an "if… then False"; x ∈ ∅ is False.
- A \ B is A ∩ Bᶜ: in A and not in B.
- To prove one set is a subset of another, take a member and chase it, as before.
