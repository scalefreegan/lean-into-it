---
id: programs-2-list-induction
title: Induction on a list
track: programs
level: 2
order: 3
concepts: [list-induction]
summary: To prove something about every list, prove it for the empty list, and then for a list with one more element in front. The same two steps as for numbers.
given: |
  @[simp] def len : List ℕ → ℕ
    | [] => 0
    | _ :: xs => len xs + 1

  @[simp] def app : List ℕ → List ℕ → List ℕ
    | [], ys => ys
    | x :: xs, ys => x :: app xs ys

  @[simp] def total : List ℕ → ℕ
    | [] => 0
    | x :: xs => x + total xs
exercises:
  - id: app-nil
    title: Joining nothing on the right
    mode: board
    says: For any list xs, joining the empty list onto the end of xs gives xs.
    statement: "(xs : List ℕ) : app xs [] = xs"
    moves: [induction, rfl, simp, exact]
    solution: |
      induction' xs with x xs ih
      rfl
      simp
      exact ih
  - id: len-app
    title: The length of a join
    mode: board
    says: For any lists xs and ys, the length of xs joined to ys is the length of xs plus the length of ys.
    statement: "(xs ys : List ℕ) : len (app xs ys) = len xs + len ys"
    moves: [induction, rfl, simp, rw, omega]
    solution: |
      induction' xs with x xs ih
      simp
      simp
      rw [ih]
      omega
  - id: total-app
    title: Now type one
    mode: typed
    says: For any lists xs and ys, the total of xs joined to ys is the total of xs plus the total of ys.
    statement: "(xs ys : List ℕ) : total (app xs ys) = total xs + total ys"
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?]
    solution: |
      induction xs with
      | nil => simp
      | cons x xs ih =>
        simp [ih]
        omega
  - id: len-rev
    title: Reuse what you proved
    mode: typed
    says: For any list xs, the reverse of xs has the same length as xs.
    statement: "(xs : List ℕ) : len (rev xs) = len xs"
    given: |
      @[simp] def rev : List ℕ → List ℕ
        | [] => []
        | x :: xs => app (rev xs) [x]

      theorem len_app (xs ys : List ℕ) : len (app xs ys) = len xs + len ys := by
        induction xs with
        | nil => simp
        | cons x xs ih =>
          simp [ih]
          omega
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?]
    solution: |
      induction xs with
      | nil => rfl
      | cons x xs ih => simp [len_app, ih]
---

The last lesson ended with a statement that is plainly true and that `rfl` cannot prove: `app xs [] = xs`. This lesson proves it, and then proves the specification of `app`.

## The same dominoes

The lesson on induction proved things about every natural number in two steps: for 0, and then for n + 1 using n. It worked because a number is zero or the one after a number.

A list is empty, or one element in front of a list. So:

> **Induction on a list.** To prove a statement for every list, prove two things. The **base case**: it holds for `[]`. The **step**: if it holds for `xs`, then it holds for `x :: xs`, whatever x is.

Every list is reached this way. `[4, 7, 9]` is 4 in front of `[7, 9]`, which is 7 in front of `[9]`, which is 9 in front of `[]`. The base case knocks over `[]`, and the step knocks over each longer list in turn.

## On the board

Click **induction**, then click the list. Two goals appear, which Lean calls `nil` and `cons`, its names for the empty list and for "one in front".

- In the first, `xs` has become `[]`.
- In the second, `xs` has become `x :: xs`, and there is a new fact `ih`: the statement for the shorter list `xs`.

One more thing is new. In these lessons the functions `len`, `app` and `total` are marked so that **simp** may use their definitions. So `simp` can unfold `app (x :: xs) []` into `x :: app xs []` for you, and tidy up what follows. It will not use `ih` unless told to. That part is yours.

```exercise
id: app-nil
```

Look at what the step did. The goal was `app (x :: xs) [] = x :: xs`. By definition the left side is `x :: app xs []`, so both sides are lists starting with x, and `simp` reduced the goal to their rests being equal: `app xs [] = xs`. That is the induction hypothesis, word for word.

## The specification of app

Now the theorem from the last lesson. The induction is on `xs`, the first list, because `app` is defined by what its first list looks like. In an induction about a program, **do induction on the thing the program recurses on.**

After `simp` in the step, the induction hypothesis does not match the goal exactly. But the goal contains its left-hand side, `len (app xs ys)`, so you can rewrite with it. What is left after that is arithmetic.

The base case here is `len (app [] ys) = len [] + len ys`. Worked out, its right side is `0 + len ys`, and you know from the math lessons that `rfl` cannot remove a zero on that side. `simp` can.

```exercise
id: len-app
```

## Typing it yourself

Typed, an induction on a list has the same form as one on a number, with the two cases named `nil` and `cons`:

```lean
induction xs with
| nil => simp
| cons x xs ih =>
  simp [ih]
  omega
```

After `cons` come your names for the first element, the rest of the list, and the induction hypothesis.

`simp [ih]` is `simp`, told to use the fact `ih` as well as its library. Anything can go in those brackets: a fact on the board, or a theorem by name.

The proof for `total` has the same shape as the one you just did on the board.

```exercise
id: total-app
```

## Building on what is proved

Here is a function that reverses a list. To reverse `x :: xs`, reverse the rest, then put x at the end.

```lean
def rev : List ℕ → List ℕ
  | [] => []
  | x :: xs => app (rev xs) [x]
```

A specification for it: reversing does not change the length. Try the proof and you will find that the step has `len (app (rev xs) [x])` in it, the length of a join. You already know what that is. `len_app`, the theorem you proved above, is on hand for this exercise under that name, and `simp [len_app, ih]` may use it.

This is how verified programs grow. `rev` is built from `app`, and the proof about `rev` is built from the proof about `app`. A proved theorem about a small function is a tool for every function that uses it.

```exercise
id: len-rev
```

## What you used

- Induction on a list: prove it for `[]`, then for `x :: xs` using it for `xs`.
- Do induction on the list the program recurses on.
- `simp` unfolds the definitions; `simp [ih]` also uses the induction hypothesis.
- A theorem already proved, such as `len_app`, can be used in the next proof.
