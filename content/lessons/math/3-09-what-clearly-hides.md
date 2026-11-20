---
id: math-3-clearly
title: What "clearly" hides
track: math
level: 3
order: 9
craft: true
concepts: [inequalities]
summary: A written proof says "clearly", "similarly" and "without loss of generality". Lean makes you say what they stand for. Why it is worth stating a lemma once and using it again.
exercises:
  - id: three-squares
    title: Use it three times
    mode: typed
    says: For any real numbers a, b and c, ab + bc + ca ≤ a² + b² + c².
    statement: "(a b c : ℝ) : a * b + b * c + c * a ≤ a ^ 2 + b ^ 2 + c ^ 2"
    forbid: [grind, bound, aesop, exact?, apply?, hint, rw?, nlinarith, polyrith, two_mul_le_add_sq, two_mul_le_add_pow_two]
    solution: |
      have key : ∀ x y : ℝ, 2 * x * y ≤ x ^ 2 + y ^ 2 := fun x y => by linarith [sq_nonneg (x - y)]
      have h1 := key a b
      have h2 := key b c
      have h3 := key c a
      linarith
  - id: clearly-divide
    kind: flaw
    title: What the "clearly" hid
    says: A proof that x/y + y/x ≥ 2 for all nonzero reals x and y.
    steps:
      - Let x and y be nonzero real numbers.
      - Since (x − y)² ≥ 0, we have x² + y² ≥ 2xy.
      - Dividing both sides by xy, which clearly keeps the inequality, gives x²/(xy) + y²/(xy) ≥ 2.
      - That is x/y + y/x ≥ 2.
    flaw: 3
    why: Dividing by a negative number reverses an inequality, and xy is negative when x and y have opposite signs. At x = 1 and y = −1, x/y + y/x is −2. The "clearly" hid a case, xy < 0, and the claim is false there.
---

Read a proof in a textbook and you will find sentences like these: *"Clearly…", "Similarly for b and c…", "Without loss of generality, assume a ≤ b…"* A page of mathematics is written for a reader who can fill in the gaps. A formal proof is written for a reader who cannot, and Lean is that reader.

This lesson is about the gaps: what is in them, and what you do about them.

## A proof as a textbook writes it

> For all real numbers a, b and c: ab + bc + ca ≤ a² + b² + c².

Here is the proof as you would read it in a book:

> *Proof.* For any real x and y, (x − y)² ≥ 0, so 2xy ≤ x² + y². Apply this to a and b, giving 2ab ≤ a² + b². Similarly 2bc ≤ b² + c² and 2ca ≤ c² + a². Add the three and divide by 2.

It is a good proof, and every reader accepts it. One sentence is doing something sly: **"similarly"**. It stands for two whole steps that look like the first and are not the same: they are the first with a different pair of numbers in it.

## The lemma

The way to say "similarly" exactly is to state the thing once, for **any** two numbers, and then use it. A fact proved for every x and y can be used for a and b, then b and c, then c and a. That is a **lemma**: a small result you prove on the way, so that you can use it more than once.

You have proved this lemma already, for a and b, in the lesson on inequalities: `have h : 0 ≤ (a - b) ^ 2`{say: have h, 0 is at most a minus b, squared}, then `linarith`. The fact `sq_nonneg (x - y)` says the same for any x and y, `0 ≤ (x - y) ^ 2`, and `linarith` can use it even though it has squares in it: after expanding (x − y)², the square terms and the product term line up with the goal, and `linarith` treats `x ^ 2`, `y ^ 2` and `x * y` as unknowns.

What is new here is using it three times.

## Stating a lemma inside a proof

In Lean the lemma goes in a line of its own, with `have`:

```lean say: have key, for all reals x and y, two x y is at most x squared plus y squared, is proved by the following.
have key : ∀ x y : ℝ, 2 * x * y ≤ x ^ 2 + y ^ 2 := fun x y => by linarith [sq_nonneg (x - y)]
```

After that line `key` is a fact in your list, like any hypothesis. It says something for **all** x and y. Give it two numbers and it says something about those two:

```lean say: have h one is key applied to a and b.
have h1 := key a b
```

Now `h1 : 2 * a * b ≤ a ^ 2 + b ^ 2`. Do that for the other two pairs and add them up. Write the whole proof, with the lemma stated once and used three times.

```exercise
id: three-squares
```

Lean would also accept `linarith [sq_nonneg (a - b), sq_nonneg (b - c), sq_nonneg (c - a)]`{say: linarith, given that the squares of a minus b, b minus c and c minus a are not negative}, with no lemma. That is the same argument with the lemma's proof written out three times instead of stated once. For a one-line lemma it hardly matters. For a lemma that takes ten lines to prove, it is the difference between a proof you can read and one you cannot.

Here is a Lean proof beside the textbook one. Select a sentence to see the lines that say it.

```widget
type: informal-formal
exercise: three-squares
steps:
  - "1: For any real x and y, (x − y)² ≥ 0, so 2xy ≤ x² + y². That is the lemma."
  - "2: Apply it to a and b: 2ab ≤ a² + b²."
  - "3-4: Similarly 2bc ≤ b² + c² and 2ca ≤ c² + a²."
  - "5: Add the three and divide by 2."
caption: The book's "similarly" is two lines of Lean, and each is the lemma with different numbers in it.
```

The book spends one word on "similarly"; the Lean spends a short line on each pair. The difference is that in Lean you could not skip them. Lean does not know that the second is like the first. You tell it by naming the pair.

## What else is hidden

A proof is written for a reader, and a reader fills gaps. These are the words that mark a gap, and what Lean needs in their place.

- **"Clearly" or "obviously".** Something the author did not want to prove. Sometimes it is a one-line fact (`positivity` can supply it). Sometimes it is false in a case the author overlooked.
- **"Similarly" or "by symmetry".** The same argument again with the letters changed. In Lean, a lemma for all letters, used at each.
- **"Without loss of generality" (WLOG).** "We may assume a ≤ b, since otherwise swap the names." It is a claim that the two cases are mirror images, so one case will do. In Lean you must prove that claim, or split into the two cases and prove both. It is the lesson before this one in disguise.
- **"And so on".** An induction, not yet written.

Sometimes the hidden step was a real mistake. This argument has a "clearly" that a reader skates past:

```exercise
id: clearly-divide
```

The lesson is not that "clearly" is bad. Mathematicians use it, and they are right to: a proof has to be short enough to read. But a gap in a written proof is a promise that you could fill it. A formal proof is where you keep the promise, and doing so finds the cases where you could not.

## What you used

- `have name : statement := proof`{say: have, a name, colon, the statement, then the proof} states a fact once and keeps it.
- A lemma `∀ x y, …` can be used at any particular numbers: `key a b`.
- A "similarly" is the same lemma used at different numbers; a "clearly" is a step to be written out; a WLOG is a case split.
- `linarith [sq_nonneg (x - y)]`: give `linarith` a fact it needs as an extra argument.
