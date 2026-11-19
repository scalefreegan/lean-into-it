---
id: programs-2-test-vs-proof
title: A test is not a proof
track: programs
level: 2
order: 4
concepts: [test-vs-proof]
summary: A program with a bug in it that passes every test it was given, and passes a proof as well. What the tests missed, and what the theorem failed to say.
given: |
  @[simp] def len : List ℕ → ℕ
    | [] => 0
    | _ :: xs => len xs + 1

  @[simp] def app : List ℕ → List ℕ → List ℕ
    | [], ys => ys
    | x :: xs, ys => x :: app xs ys

  @[simp] def rev : List ℕ → List ℕ
    | [] => []
    | x :: xs => app (rev xs) [x]

  @[simp] def badRev : List ℕ → List ℕ
    | [] => []
    | x :: xs => app [x] (badRev xs)
exercises:
  - id: test-one
    title: The first test passes
    mode: board
    says: badRev of the list 7 is the list 7.
    statement: ": badRev [7] = [7]"
    moves: [rfl]
    solution: |
      rfl
  - id: test-two
    title: The second test passes
    mode: board
    says: badRev of the list 1, 2, 1 is the list 1, 2, 1.
    statement: ": badRev [1, 2, 1] = [1, 2, 1]"
    moves: [rfl]
    solution: |
      rfl
  - id: same-length
    title: A proof passes too
    mode: typed
    says: For any list xs, badRev of xs has the same length as xs.
    statement: "(xs : List ℕ) : len (badRev xs) = len xs"
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?]
    solution: |
      induction xs with
      | nil => rfl
      | cons x xs ih => simp [ih]
  - id: find-the-bug
    title: Find the bug
    mode: board
    says: There is a list on which badRev and rev give different answers.
    statement: ": ∃ xs : List ℕ, badRev xs ≠ rev xs"
    moves: [use, decide, rfl]
    solution: |
      use [1, 2]
      decide
  - id: what-it-does
    title: What it really does
    mode: typed
    says: For any list xs, badRev of xs is xs.
    statement: "(xs : List ℕ) : badRev xs = xs"
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?]
    solution: |
      induction xs with
      | nil => rfl
      | cons x xs ih => simp [ih]
---

Somebody else has written a function to reverse a list. They call it `badRev`, though they did not know yet that the name would fit.

```lean say: A definition of bad rev, from lists to lists, in two cases. The empty list gives the empty list. And x followed by x's gives app of the list x and bad rev of x's.
def badRev : List ℕ → List ℕ
  | [] => []
  | x :: xs => app [x] (badRev xs)
```

Compare it with `rev` from the last lesson, whose second line is `app (rev xs) [x]`. The two arguments of `app` are the other way round. It is an easy slip to make.

## The tests pass

The author tested it. A list of one element, reversed, is itself:

```exercise
id: test-one
```

And a longer list:

```exercise
id: test-two
```

Both pass. There was a third test, on the empty list, and it passed as well.

## A proof passes too

The author went further and proved a specification, the same one you proved for `rev`: the result has the same length as the input.

```exercise
id: same-length
```

It is a real theorem, and Lean accepted your proof of it. So `badRev` has three passing tests and a verified property. It is still wrong.

## Find the bug

A function that reverses lists should agree with `rev` on every list. Show that `badRev` does not: give one list where the two differ. Then **decide** will run both and confirm it.

This is the reverse of everything so far in this track. To show a program *wrong* you need only one input. Look at the tests above and ask what the lists in them have in common.

```exercise
id: find-the-bug
```

## What went wrong, twice

The tests were all on lists that read the same forwards and backwards. On a list like that, a function that reverses and a function that does nothing give the same answer. The tests could not tell them apart. More tests would probably have caught this bug, but a test can only show what happens on the inputs somebody thought to try.

The proof is the more interesting failure. Nothing was wrong with it. What was wrong was the **statement**: "the result has the same length as the input" is true of a correct reverse, and it is just as true of a function that returns its input untouched. A proof tells you that the statement holds, and nothing more. If the statement says too little, the proof says too little.

> A verified program is exactly as good as its specification. Lean checks that the proof proves the statement. Whether the statement says what you meant is your job, and no checker can do it for you.

So what does `badRev` do? You can settle that with a theorem too.

```exercise
id: what-it-does
```

That is a complete description of `badRev`, proved for every list: it does nothing. A specification can pin a function down completely, and when it does, there is nowhere for a bug to hide.

A specification of that strength for the real `rev` takes two statements: reversing a list of one element gives it back, and reversing a join gives the two reverses joined the other way round. Only one function satisfies both. A third, that reversing twice gives the list back, then follows. Those proofs need a few lemmas about `app` first. They are the next lesson.

## What you used

- A test shows what a program does on the inputs that were tried.
- One input is enough to show a program wrong: `use` it, then `decide`.
- A proof shows that the statement holds. It cannot show that the statement is the right one.
- A specification that says too little can be true of a wrong program.
