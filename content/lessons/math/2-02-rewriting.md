---
id: math-2-rewriting
title: Equal things can be swapped
track: math
level: 2
order: 2
concepts: [rewriting]
summary: If a = b, then anywhere a appears you may write b instead. That is most of algebra, and the move for it is rw.
exercises:
  - id: replace
    title: Replace a by b
    mode: board
    says: Suppose a = b. Then a + 3 = b + 3.
    statement: "(a b : ℕ) (h : a = b) : a + 3 = b + 3"
    moves: [rw, exact]
    solution: |
      rw [h]
  - id: then-finish
    title: Rewrite, then finish
    mode: board
    says: Suppose a = b, and f(b) = 7. Then f(a) = 7.
    statement: "(f : ℕ → ℕ) (a b : ℕ) (h : a = b) (hf : f b = 7) : f a = 7"
    moves: [rw, exact]
    solution: |
      rw [h]
      exact hf
  - id: backwards
    title: The other way round
    mode: board
    says: Suppose a = b, and f(a) = 7. Then f(b) = 7.
    statement: "(f : ℕ → ℕ) (a b : ℕ) (h : a = b) (hf : f a = 7) : f b = 7"
    moves: [rw, rw_back, exact]
    solution: |
      rw [← h]
      exact hf
  - id: chain
    title: A chain of equals
    mode: board
    says: Suppose a = b and b = c. Then a = c.
    statement: "(a b c : ℕ) (h1 : a = b) (h2 : b = c) : a = c"
    moves: [rw, rw_back, exact]
    solution: |
      rw [h1]
      exact h2
  - id: a-rule
    title: Rewrite with a rule
    mode: board
    says: Suppose f(x) = x + 1 for every x. Then f(2) = 3.
    statement: "(f : ℕ → ℕ) (hf : ∀ x, f x = x + 1) : f 2 = 3"
    moves: [rw, rw_back, exact]
    solution: |
      rw [hf]
  - id: typed
    title: Now type one
    mode: typed
    says: Suppose a = b and c = b. Then a + a = c + c.
    statement: "(a b c : ℕ) (h1 : a = b) (h2 : c = b) : a + a = c + c"
    forbid: [omega, simp, simp_all, subst, subst_vars, aesop, grind, tauto, exact?, apply?, linarith, norm_num, simpa, hint, rw?, nlinarith, ring1, abel1, abel_nf, ac_nf, noncomm_ring, linear_combination, subst_eqs, positivity, bound, norm_num1]
    solution: |
      rw [h1, h2]
---

When you solve an equation at school, most steps are one idea used again and again: **equal things can be swapped**. If you know x = 3, you may write 3 wherever x appears. Mathematicians call this *substitution*. Lean calls it *rewriting*.

## Rewriting the goal

The move is **rw**. Click it, then click an equation among your facts. With `h : a = b`, every `a` in the goal becomes `b`.

```exercise
id: replace
```

That finished at once, and it is worth seeing why. After the rewrite the goal was `b + 3 = b + 3`. Both sides are identical, and `rw` closes a goal like that by itself, as `rfl` would.

Usually something is left to do after rewriting.

```exercise
id: then-finish
```

## Direction matters

`rw` always replaces the **left** side of the equation by the **right** side. With `h : a = b` it turns a into b, never b into a. If the goal has only b in it, there is nothing for it to replace, and Lean says so.

For the other direction there is **rw ←**: it replaces the right side by the left. The arrow says "read the equation backwards".

```exercise
id: backwards
```

Try plain `rw` with `h` there, if you did not, and read the refusal.

Rewriting twice chains two equations. In a written proof this is the line "a = b = c".

```exercise
id: chain
```

## Rewriting with a rule

The equation can be a for-all. A fact `hf : ∀ x, f x = x + 1` is a rule for working out f, and `rw` uses it on whatever `f …` it finds in the goal, here `f 2`.

```exercise
id: a-rule
```

## Typing it yourself

Typed, the facts go in square brackets: `rw [h]`. Several in a row are separated by commas, `rw [h1, h2]`, and are used one after the other. The backwards arrow is typed `\l` then a space, or `<-`: `rw [← h]`.

One more form, for later: `rw [h] at h2` rewrites inside the fact `h2`, not the goal.

```exercise
id: typed
```

## What you used

- `rw [h]` with `h : a = b`: every a in the goal becomes b.
- `rw [← h]`: every b becomes a.
- `rw [h1, h2]`: one rewrite after the other.
- If both sides come out identical, `rw` finishes the goal.
