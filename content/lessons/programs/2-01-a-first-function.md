---
id: programs-2-first-function
title: A first function
track: programs
level: 2
order: 1
concepts: [list-recursion]
summary: Lists, and two small programs on them, written the way addition was defined. Then the first way of checking a program, which is to run it on examples.
given: |
  @[simp] def len : List ℕ → ℕ
    | [] => 0
    | _ :: xs => len xs + 1

  @[simp] def app : List ℕ → List ℕ → List ℕ
    | [], ys => ys
    | x :: xs, ys => x :: app xs ys
exercises:
  - id: test-len
    title: A test
    mode: board
    says: The length of the list 4, 7, 9 is 3.
    statement: ": len [4, 7, 9] = 3"
    moves: [rfl]
    solution: |
      rfl
  - id: test-app
    title: Another test
    mode: board
    says: Joining the list 1, 2 to the list 3 gives the list 1, 2, 3.
    statement: ": app [1, 2] [3] = [1, 2, 3]"
    moves: [rfl]
    solution: |
      rfl
  - id: len-cons
    title: One line of the definition
    mode: board
    says: For any number x and any list xs, the length of x in front of xs is the length of xs, plus 1.
    statement: "(x : ℕ) (xs : List ℕ) : len (x :: xs) = len xs + 1"
    moves: [rfl]
    solution: |
      rfl
  - id: app-empty
    title: Joining onto nothing
    mode: board
    says: For any list ys, joining the empty list to ys gives ys.
    statement: "(ys : List ℕ) : app [] ys = ys"
    moves: [rfl]
    solution: |
      rfl
  - id: typed
    title: Now type one
    mode: typed
    says: Joining 1, 2 to 3, 4, 5 gives a list of length 5.
    statement: ": len (app [1, 2] [3, 4, 5]) = 5"
    solution: |
      rfl
---

This track is about programs: writing a small one, saying exactly what it should do, and proving that it does. The programs are *functions*, like the ones in a mathematics book. They take something in and give something back, and they change nothing else. Lean is a programming language as well as a proof checker, so the program and the proof about it are written in the same place.

## Lists

Programs need data, and the simplest data with any structure is a **list**: some things in a row. `[4, 7, 9]` is a list of three numbers. Lean writes the kind "list of natural numbers" as `List ℕ`.

The math lessons of this level began with what a natural number is: zero, or the one after a number. A list is built the same way.

> A list is either **empty**, written `[]`, or **one element in front of a list**, written `x :: xs`.

So `[4, 7, 9]` is shorthand for `4 :: (7 :: (9 :: []))`, just as 3 is shorthand for the one after the one after the one after zero. The names are a habit worth copying: `x` for one element, `xs` (say "exes") for a list of them.

## A function by recursion

Addition was defined by saying what to do at zero and what to do at "the one after". A function on lists is defined by saying what to do at `[]` and what to do at `x :: xs`.

Here is the length of a list:

```lean
def len : List ℕ → ℕ
  | [] => 0
  | _ :: xs => len xs + 1
```

The first line names the function and gives its kind: it takes a `List ℕ` and returns a `ℕ`. Then there is one line for each way a list can be built. The empty list has length 0. A list with an element in front is one longer than the rest. The underscore `_` means "an element is here, and its value does not matter".

And here is `app`, which joins two lists end to end. (Lean has both of these built in, as `List.length` and `++`. Writing them yourself is the point.)

```lean
def app : List ℕ → List ℕ → List ℕ
  | [], ys => ys
  | x :: xs, ys => x :: app xs ys
```

It takes two lists. Joining the empty list to `ys` gives `ys`. Joining `x :: xs` to `ys` keeps `x` in front and joins the rest.

## Running it

The first thing anyone does with a new program is run it. In the **Playground**, paste the two definitions and add:

```lean
#eval len [4, 7, 9]
#eval app [1, 2] [3]
```

`#eval` works the expression out and prints the answer: `3`, and `[1, 2, 3]`.

That is a **test**: one input, and the output you expected. A test can also be written as a statement, and then Lean will check it as a proof. The move is the one that finishes an equation whose two sides work out to the same thing.

```exercise
id: test-len
```

```exercise
id: test-app
```

## More than a test

A test is about particular lists. But some facts about `len` and `app` hold for every list, and are true by definition: they are just the lines of the definitions read as equations. `rfl` proves those too, letters and all.

```exercise
id: len-cons
```

```exercise
id: app-empty
```

Each of those is a statement about infinitely many inputs at once, which no amount of running could check. The rest of this track is about statements like that.

## Typing it yourself

```exercise
id: typed
```

## What you used

- A list is `[]` or `x :: xs`.
- A function on lists says what to do in each of those two cases.
- `#eval` runs a program on one input.
- A test, written as a statement, is proved by `rfl`.
