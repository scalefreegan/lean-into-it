---
id: programs-2-rev-spec
title: The whole of rev
track: programs
level: 2
order: 5
concepts: [full-specification]
summary: Two statements that only a correct reverse can satisfy, the lemmas about joining that the proofs lean on, and reversing twice as a consequence.
given: |
  @[simp] def app : List ℕ → List ℕ → List ℕ
    | [], ys => ys
    | x :: xs, ys => x :: app xs ys

  @[simp] def rev : List ℕ → List ℕ
    | [] => []
    | x :: xs => app (rev xs) [x]

  theorem app_nil (xs : List ℕ) : app xs [] = xs := by
    induction xs with
    | nil => rfl
    | cons x xs ih => simp [ih]
exercises:
  - id: rev-single
    title: One element
    mode: board
    says: The reverse of a list with one element x is that list.
    statement: "(x : ℕ) : rev [x] = [x]"
    moves: [rfl]
    solution: |
      rfl
  - id: app-assoc
    title: Joining in either order
    mode: typed
    says: For any lists xs, ys and zs, joining xs and ys and then zs gives the same list as joining xs to ys and zs already joined.
    statement: "(xs ys zs : List ℕ) : app (app xs ys) zs = app xs (app ys zs)"
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?]
    solution: |
      induction xs with
      | nil => rfl
      | cons x xs ih => simp [ih]
  - id: rev-app
    title: The reverse of a join
    mode: typed
    says: For any lists xs and ys, the reverse of xs joined to ys is the reverse of ys joined to the reverse of xs.
    statement: "(xs ys : List ℕ) : rev (app xs ys) = app (rev ys) (rev xs)"
    given: |
      theorem app_assoc (xs ys zs : List ℕ) : app (app xs ys) zs = app xs (app ys zs) := by
        induction xs with
        | nil => rfl
        | cons x xs ih => simp [ih]
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?]
    solution: |
      induction xs with
      | nil => simp [app_nil]
      | cons x xs ih => simp [ih, app_assoc]
  - id: rev-rev
    title: Reversing twice
    mode: typed
    says: For any list xs, reversing xs twice gives xs.
    statement: "(xs : List ℕ) : rev (rev xs) = xs"
    given: |
      theorem app_assoc (xs ys zs : List ℕ) : app (app xs ys) zs = app xs (app ys zs) := by
        induction xs with
        | nil => rfl
        | cons x xs ih => simp [ih]

      theorem rev_app (xs ys : List ℕ) : rev (app xs ys) = app (rev ys) (rev xs) := by
        induction xs with
        | nil => simp [app_nil]
        | cons x xs ih => simp [ih, app_assoc]
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?]
    solution: |
      induction xs with
      | nil => rfl
      | cons x xs ih => simp [rev_app, ih]
  - id: only-rev
    title: Nothing else fits
    mode: typed
    says: If a function f gives back every list of one element, and turns the join of xs and ys into the join of f of ys and f of xs, then f is rev.
    statement: "(f : List ℕ → List ℕ) (h1 : ∀ x, f [x] = [x]) (h2 : ∀ xs ys, f (app xs ys) = app (f ys) (f xs)) (xs : List ℕ) : f xs = rev xs"
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?]
    solution: |
      induction xs with
      | nil =>
        obtain h := h2 [] [0]
        rw [app, h1, app, app] at h
        simp at h
        exact h
      | cons x xs ih =>
        obtain h := h2 [x] xs
        rw [app, app, h1, ih] at h
        rw [h, rev]
---

The last lesson ended on a promise. "The result has the same length as the input" was true of `badRev`, which does nothing, so it was too weak to catch it. A specification strong enough leaves no room for a wrong program. For `rev` it takes two statements:

1. Reversing a list of one element gives it back: rev [x] = [x].
2. Reversing a join gives the two reverses, joined the other way round: rev (xs ++ ys) = rev ys ++ rev xs, written here with `app` for the join.

This lesson proves both about `rev`. Then it proves that they say everything: any function that satisfies them *is* `rev`.

The definitions are the ones from before, and `app_nil` (joining the empty list on the right changes nothing) comes with them, because you proved it two lessons ago. A proved theorem is a tool from then on. That is how real verified programs are built: state a small lemma, prove it, and use it in the next proof.

## The easy half

The first statement is a calculation. `rev [x]` unfolds to `app (rev []) [x]`, then to `app [] [x]`, then to `[x]`.

```exercise
id: rev-single
```

## A lemma about joining

The second statement needs a fact about `app` first. Joining three lists, it does not matter which two are joined first:

app (app xs ys) zs = app xs (app ys zs)

This is called associativity, the same word as for addition, where (a + b) + c = a + (b + c). The proof is induction on xs, as in the lesson on induction on a list. `app` works through its first list, which is why the induction is on that one.

```exercise
id: app-assoc
```

## The reverse of a join

Now the second statement. Do induction on xs again.

- In the `nil` case the goal is about `app [] ys`, which is `ys`, so it says rev ys = app (rev ys) []. That is `app_nil`, read the other way round.
- In the `cons` case, unfolding gives `app (rev (app xs ys)) [x]` on the left. The induction hypothesis rewrites the inner reverse. What remains is two ways of joining three lists, and `app_assoc` says they are the same.

Both lemmas are given to this exercise by name. `simp [app_nil]` and `simp [ih, app_assoc]` hand them to `simp` to use as rewrites.

```exercise
id: rev-app
```

## Reversing twice

With the reverse of a join proved, reversing twice is a short step. In the `cons` case, `rev (x :: xs)` is `app (rev xs) [x]`, and reversing that join puts `rev [x]` first, followed by `rev (rev xs)`. The first is `[x]`, the second is `xs` by the induction hypothesis.

The theorem you just proved is given to this exercise under the name `rev_app`, and `app_assoc` comes with it. Hand `rev_app` and the induction hypothesis to `simp`.

```exercise
id: rev-rev
```

Reversing twice gives the list back: that is often given as *the* specification of reverse. On its own it is not enough. The function that does nothing satisfies it too, and so do others. Swap every 0 for a 1 and every 1 for a 0, and then reverse: doing that twice also gives the list back, and it also turns a join into the two results joined the other way round. So reversing twice, together with the rule for joins, still lets a wrong function through. The rule for a single element is the one that stops it: this function turns [0] into [1].

## Nothing else fits

Here is the payoff. Take any function `f` with the two properties, `h1` and `h2`. Show that `f` agrees with `rev` on every list.

Do induction on xs.

- **The `nil` case: f [] = [].** Use `h2` on `[]` and `[0]`: `obtain h := h2 [] [0]` names that fact `h`. The join `app [] [0]` is `[0]`, so `h2` says f [0] = app (f [0]) (f []). With `h1` that is [0] = app [0] (f []), and `app` unfolds the right side to 0 :: f []. Two lists that start the same are equal when their tails are, and `simp at h` turns h into exactly that: f [] = [].
- **The `cons` case.** `x :: xs` is the join `app [x] xs`, so `obtain h := h2 [x] xs` splits `f (x :: xs)` into `app (f xs) (f [x])`. Then `h1` and the induction hypothesis turn that into `app (rev xs) [x]`, which is what `rev (x :: xs)` is.

`rw [...] at h` rewrites a hypothesis instead of the goal, which is what both steps need. A definition can be a rewrite too: `rw [app]` unfolds one step of `app`, turning `app [x] xs` into `x :: app [] xs` and then, used again, into `x :: xs`; `rw [rev]` does the same for `rev`. `simp` unfolds every step it can at once, so in the `nil` case `simp [h1] at h` does the work of the `rw` and the `simp` together.

```exercise
id: only-rev
```

So the two statements are a complete specification: one function meets them, and it is `rev`. Proving `rev` correct against them leaves nothing for a bug to hide in. The specification for `badRev` in the last lesson was too weak. This one has nothing missing.

## What you used

- A lemma proved once is a tool from then on: `simp [app_nil]` hands it to `simp`.
- Associativity of `app`, by induction on the first list.
- `obtain h := h2 a b` names one case of a fact that holds for all lists.
- `rw [...] at h` rewrites a hypothesis.
- A specification is complete when only one function satisfies it, and that can be proved too.
