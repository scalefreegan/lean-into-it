---
id: math-4-set-equality
title: Proving two sets equal
track: math
level: 4
order: 3
concepts: [set-equality]
summary: ext turns one equation into two inclusions, each proved by chasing a member.
exercises:
  - id: read-equal
    kind: read
    title: What equal sets are
    statement: "(A B : Set ℕ) : A = B"
    options:
      - Every member of A is in B, and every member of B is in A.
      - Every member of A is in B.
      - A and B have the same number of members.
      - A and B share at least one member.
    solution: Every member of A is in B, and every member of B is in A.
    why: Two sets are equal when they have exactly the same members. Nothing else about a set counts, not how it was described, not the order its members were listed in. So A = B is two inclusions at once, A ⊆ B and B ⊆ A.
  - id: ext-goal
    kind: predict
    title: What ext leaves
    says: The intersection of A and B equals the intersection of B and A.
    statement: "(A B : Set ℕ) : A ∩ B = B ∩ A"
    move: ext x
    options:
      - "A B : Set ℕ\nx : ℕ\n⊢ x ∈ A ∩ B ↔ x ∈ B ∩ A"
      - "A B : Set ℕ\nx : ℕ\n⊢ x ∈ A ∩ B → x ∈ B ∩ A"
      - "A B : Set ℕ\n⊢ A ∩ B ⊆ B ∩ A"
    solution: "A B : Set ℕ\nx : ℕ\n⊢ x ∈ A ∩ B ↔ x ∈ B ∩ A"
  - id: inter-comm
    title: The intersection, either way round
    mode: typed
    says: The intersection of A and B equals the intersection of B and A.
    statement: "(A B : Set ℕ) : A ∩ B = B ∩ A"
    forbid: &ops [norm_num, simp, simp_all, simpa, dsimp, decide, trivial, aesop, aesop_cat, cat_disch, grind, bound, tauto, tauto_set, solve_by_elim, observe, exact?, apply?, rw?, hint, inter_subset_left, inter_subset_right, subset_union_left, subset_union_right, inter_comm, union_comm, inter_subset_inter, union_subset_union, diff_subset, compl_union, compl_inter, inter_compl_self, compl_inter_self, subset_compl_compl, compl_compl, inf_le_left, inf_le_right, le_sup_left, le_sup_right, inf_comm, sup_comm, and_comm, or_comm, And.comm, Or.comm, And.symm, Or.symm, And.swap, Or.swap, not_or, compl_sup, disjoint_compl_right, inter_union_distrib_left, subset_inter, union_subset, symm, le_inf, sup_le, le_of_eq, inf_compl_eq_bot, inf_compl_self, compl_inf, inf_compl_le_bot, mem_union_left, mem_union_right, mem_of_mem_inter_left, mem_of_mem_inter_right, push_neg, push, order, inf_le_of_left_le, le_sup_of_le_left, subset_union_of_subset_left, isCompl_compl, disjoint_compl_left, disjoint_iff, compl_sup_distrib, compl_subset_compl, compl_le_compl, subset_inter_iff, union_subset_iff, aesop_graph, aesop_graph_nonterminal, aesop_mat, aesop_cat_nonterminal, simp_intro, simp_wf, measurability, continuity, cfc_tac, cfc_zero_tac, decreasing_tactic, decreasing_trivial, get_elem_tactic, get_elem_tactic_extensible, ac_nf, ac_rfl, closedness, compactness, nofun, restrict_tac, mfld_set_tac, sep_subset, sup_le_iff, le_inf_iff, and_not_self, sdiff_self, or_imp, itauto, lia, cutsat, grobner, grind_order, grind_linarith, comm, symm_of, diff_self, and_not_self_iff, inf_compl_eq_bot', le_hnot_inf_hnot, membership, arith_mult, basify, apply_assumption, apply_rules, gcongr, mono, vcgen, comm_of, Symm, Symmetric, symm_op, inf_himp_le, sup_himp_distrib, and_self, or_self, inter_self, union_self, inf_idem, sup_idem, antisymm, le_antisymm, ge_antisymm, subset_antisymm, eq_of_subset_of_subset, and_or_left, and_or_right, or_and_left, or_and_right, inf_sup_left, inf_sup_right, sup_inf_left, sup_inf_right, inter_union_distrib_right, union_inter_distrib_left, union_inter_distrib_right, diff_eq, inter_distrib_left, inter_distrib_right, union_distrib_left, union_distrib_right]
    solution: |
      ext x
      constructor
      · rintro ⟨ha, hb⟩
        exact ⟨hb, ha⟩
      · rintro ⟨hb, ha⟩
        exact ⟨ha, hb⟩
  - id: both-ways
    title: Each inside the other
    mode: typed
    says: If A is a subset of B and B is a subset of A, then A equals B.
    statement: "(A B : Set ℕ) (hAB : A ⊆ B) (hBA : B ⊆ A) : A = B"
    forbid: *ops
    solution: |
      ext x
      constructor
      · intro hx
        exact hAB hx
      · intro hx
        exact hBA hx
  - id: union-comm
    title: The union, either way round
    mode: typed
    says: The union of A and B equals the union of B and A.
    statement: "(A B : Set ℕ) : A ∪ B = B ∪ A"
    forbid: *ops
    solution: |
      ext x
      constructor
      · rintro (ha | hb)
        · right
          exact ha
        · left
          exact hb
      · rintro (hb | ha)
        · right
          exact hb
        · left
          exact ha
  - id: inter-self
    title: A set with itself
    mode: typed
    says: The intersection of A with itself is A.
    statement: "(A : Set ℕ) : A ∩ A = A"
    forbid: *ops
    solution: |
      ext x
      constructor
      · intro hx
        exact hx.1
      · intro hx
        exact ⟨hx, hx⟩
  - id: diff-by-definition
    title: The same set under two names
    mode: typed
    says: A minus B equals the intersection of A with the complement of B.
    statement: "(A B : Set ℕ) : A \\ B = A ∩ Bᶜ"
    forbid: *ops
    solution: |
      ext x
      exact Iff.rfl
  - id: outside-union-equal
    title: Outside a union, both halves
    mode: typed
    says: The complement of the union of A and B equals the intersection of their complements.
    statement: "(A B : Set ℕ) : (A ∪ B)ᶜ = Aᶜ ∩ Bᶜ"
    forbid: *ops
    solution: |
      ext x
      constructor
      · intro hx
        constructor
        · intro ha
          exact hx (Or.inl ha)
        · intro hb
          exact hx (Or.inr hb)
      · rintro ⟨hna, hnb⟩ (ha | hb)
        · exact hna ha
        · exact hnb hb
  - id: inter-over-union
    title: Intersection spreads over union
    mode: typed
    says: The intersection of A with the union of B and C equals the union of A ∩ B and A ∩ C.
    statement: "(A B C : Set ℕ) : A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)"
    forbid: *ops
    solution: |
      ext x
      constructor
      · rintro ⟨ha, hb | hc⟩
        · left
          exact ⟨ha, hb⟩
        · right
          exact ⟨ha, hc⟩
      · rintro (⟨ha, hb⟩ | ⟨ha, hc⟩)
        · exact ⟨ha, Or.inl hb⟩
        · exact ⟨ha, Or.inr hc⟩
---

*Union, intersection, complement* proved inclusions: one set inside another. This lesson proves that two sets are **equal**, and the method is the one you have: an equation between sets is two inclusions, and each inclusion is a member chased from one set into the other.

## What equal means for sets

A set is nothing but its members. However two sets are described, they are the same set when they have the same members.

```exercise
id: read-equal
```

So A = B says two things: everything in A is in B, and everything in B is in A. A picture can suggest it. Here are A ∩ B and B ∩ A, side by side.

```widget
type: set-diagram
formula: A ∩ B
against: B ∩ A
caption: The same region, whichever circle is named first.
```

The picture shows the regions agree. The proof takes one member and argues, in both directions.

## ext: one equation, two directions

In Lean, `ext x`{say: e x t x} turns a goal A = B into a goal about one member: x ∈ A ↔ x ∈ B. The name is short for *extensionality*, the principle that a set is settled by its members. The x it names is any member at all, as in `intro x`.

```exercise
id: ext-goal
```

What is left is an "if and only if", which you have proved since Level 1: `constructor` gives the two directions, and each begins with an `intro`, or with an `rintro` that takes the member apart as it arrives. Each direction is one of the inclusions.

```exercise
id: inter-comm
```

Here is that proof as a textbook writes it, beside the Lean. Select a sentence to see the lines that say it.

```widget
type: informal-formal
exercise: inter-comm
steps:
  - "1: Let x be any number. We show x ∈ A ∩ B exactly when x ∈ B ∩ A."
  - "2: There are two directions."
  - "3-4: If x ∈ A ∩ B, then x ∈ A and x ∈ B, so x ∈ B and x ∈ A, that is, x ∈ B ∩ A."
  - "5-6: The other direction is the same argument with A and B swapped."
caption: A textbook writes "the other direction is the same"; Lean needs it written out.
```

## Two inclusions make an equation

The two directions after `ext` are the two inclusions, written for one member. When the inclusions are already proved, each direction uses one. A fact `hAB : A ⊆ B` is an "if… then" about members: given `hx : x ∈ A`, `hAB hx` is the proof that x ∈ B.

```exercise
id: both-ways
```

This is how most set equations are proved on paper too: "we show each side is contained in the other".

```exercise
id: union-comm
```

```exercise
id: inter-self
```

## When both sides say the same thing

Sometimes the two sides are one set by definition. A \ B is, by its definition, what is in A and not in B, and so is A ∩ Bᶜ. After `ext x` the two sides of the "if and only if" are the same statement, and `exact Iff.rfl`{say: exact iff dot r f l} closes it: an "if and only if" between a statement and itself. (Lean would take `rfl` for the whole equation here too, for the same reason: the two sides are one set by definition.)

```widget
type: set-diagram
formula: 'A \ B'
against: A ∩ Bᶜ
```

```exercise
id: diff-by-definition
```

## Outside a union, both halves

*Union, intersection, complement* proved that `(A ∪ B)ᶜ ⊆ Aᶜ ∩ Bᶜ`{say: the complement of the union of A and B is a subset of the intersection of the complement of A and the complement of B}. The other inclusion holds too, and together they make an equation, one of De Morgan's laws for sets. For the new direction: a member outside A and outside B cannot be in A ∪ B, since either way it would be in one of them. `rintro ⟨hna, hnb⟩ (ha | hb)`{say: R intro, in angle brackets h n a, h n b, and in brackets h a or h b} takes both facts and then the member of the union, in two cases.

```exercise
id: outside-union-equal
```

## Intersection spreads over union

The last equation is a law of arithmetic in disguise: as a × (b + c) = a × b + a × c, so A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C).

```widget
type: set-diagram
formula: A ∩ (B ∪ C)
against: (A ∩ B) ∪ (A ∩ C)
```

The member arrives with an "and" whose second half is an "or", so `rintro ⟨ha, hb | hc⟩`{say: R intro, in angle brackets h a, and h b or h c} takes it apart into two cases at once.

```exercise
id: inter-over-union
```

## What you used

- Two sets are equal when they have the same members: A = B is A ⊆ B and B ⊆ A.
- `ext x` turns A = B into x ∈ A ↔ x ∈ B for any x; `constructor` splits that into the two inclusions.
- Given `hAB : A ⊆ B` and `hx : x ∈ A`, `hAB hx` proves x ∈ B.
- When the two sides are the same statement by definition, `exact Iff.rfl` closes the "if and only if".
