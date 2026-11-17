---
id: programs-2-specification
title: Saying what it should do
track: programs
level: 2
order: 2
concepts: [specification]
summary: A test says what a program does on one input. A specification says what it does on every input, and it is written as a theorem.
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
  - id: one-element
    title: Any list of one
    mode: board
    says: For any number x, the list containing just x has length 1.
    statement: "(x : ℕ) : len [x] = 1"
    moves: [rfl]
    solution: |
      rfl
  - id: total-two
    title: Adding up two
    mode: board
    says: For any numbers a and b, the total of the list a, b is a + b.
    statement: "(a b : ℕ) : total [a, b] = a + b"
    moves: [rfl]
    solution: |
      rfl
  - id: in-front
    title: One in front
    mode: board
    says: For any number x and list ys, joining the list containing just x to ys puts x in front of ys.
    statement: "(x : ℕ) (ys : List ℕ) : app [x] ys = x :: ys"
    moves: [rfl]
    solution: |
      rfl
  - id: typed
    title: Now type one
    mode: typed
    says: For any numbers x and y and any list xs, the list with x and y in front of xs is 2 longer than xs.
    statement: "(x y : ℕ) (xs : List ℕ) : len (x :: y :: xs) = len xs + 2"
    solution: |
      rfl
---

The last lesson ran `len` on `[4, 7, 9]` and got 3. That shows `len` is right for one list. There are infinitely many lists.

## From a test to a specification

Suppose you were asked what `app` is *supposed* to do. You would not answer with examples. You would say something general: "the result has all the elements of the first list, then all the elements of the second". Or, picking out one consequence that can be stated exactly:

*For all lists xs and ys, the length of `app xs ys` is the length of xs plus the length of ys.*

A statement like that is called a **specification**: a precise claim about what a program does on **every** input. In Lean it is written as a theorem.

```lean
theorem len_app (xs ys : List ℕ) : len (app xs ys) = len xs + len ys
```

Compare the two kinds of statement.

- A test: `len (app [1, 2] [3]) = 3`. Particular lists. Lean checks it by running the program.
- A specification: `len (app xs ys) = len xs + len ys`. Letters, standing for any lists at all. Running the program cannot check it, because there is no particular input to run it on. It needs a proof.

Once it is proved, it is settled for every pair of lists there could ever be. That is what "verified" means in "verified program".

## A new function

One more function for this lesson: `total` adds up a list of numbers.

```lean
def total : List ℕ → ℕ
  | [] => 0
  | x :: xs => x + total xs
```

## Small specifications

Some specifications are true by definition: unfold the function a fixed number of times and both sides are the same. These are about every x, or every list ys, and still `rfl` proves them.

```exercise
id: one-element
```

```exercise
id: total-two
```

```exercise
id: in-front
```

## Typing it yourself

```exercise
id: typed
```

## Where rfl stops

Now look at two statements about `app` that seem alike.

- `app [] ys = ys`
- `app xs [] = xs`

Joining the empty list on either side should change nothing. You proved the first with `rfl` in the last lesson: it is a line of the definition. The second is not. `app` is defined by what its **first** list looks like, and in `app xs []` the first list is a letter. Lean cannot tell which line applies.

You have met this before. `a + 0 = a` is true by definition and `0 + a = a` is not, because addition is defined by what its second number is. The cure was induction on the number. Here the cure is induction on the list, and it is the subject of the next lesson.

## What you used

- A specification is a claim about what a program does on every input, written as a theorem.
- A test is checked by running. A specification needs a proof.
- Some specifications are true by definition, and `rfl` proves them.
