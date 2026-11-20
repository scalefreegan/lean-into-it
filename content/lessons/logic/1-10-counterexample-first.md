---
id: logic-1-counterexample-first
title: Look for a counterexample first
track: logic
level: 1
order: 10
craft: true
concepts: [forall, exists]
summary: Before you try to prove a claim, try to break it, and know where to look. The small cases, the edges, the numbers with a special shape.
exercises:
  - id: factorial-plus-one
    kind: truefalse
    title: One more than a factorial
    concept: forall
    says: For every natural number n, n! + 1 is prime.
    statement: "(n : ℕ) : Nat.Prime (Nat.factorial n + 1)"
    truth: false
    why: At n = 4, 4! + 1 = 24 + 1 = 25, which is 5 × 5. (For n = 0, 1, 2 and 3 it gives 2, 2, 3 and 7, all prime.)
    counterexample: "4"
    close: decide
  - id: squares-beat
    kind: truefalse
    title: The edges
    concept: forall
    says: For every natural number n, n² is greater than n.
    statement: "(n : ℕ) : n ^ 2 > n"
    truth: false
    why: At n = 0, n² is 0, which is not greater than 0. At n = 1, n² is 1, which is not greater than 1. From n = 2 on it holds.
    counterexample: "1"
  - id: even-squares
    kind: truefalse
    title: Even numbers, squared, plus one
    concept: forall
    says: For every natural number n, if n is even and not 0, then n² + 1 is prime.
    statement: "(n : ℕ) : 0 < n → n % 2 = 0 → Nat.Prime (n ^ 2 + 1)"
    truth: false
    why: At n = 8, n² + 1 = 65, which is 5 × 13. (For n = 2, 4 and 6 it gives 5, 17 and 37, all prime.)
    counterexample: "8"
  - id: mersenne
    kind: truefalse
    title: One less than a power of two
    concept: forall
    says: For every prime p, 2^p − 1 is prime.
    statement: "(p : ℕ) : Nat.Prime p → Nat.Prime (2 ^ p - 1)"
    truth: false
    why: For p = 11, 2^11 − 1 = 2047, which is 23 × 89. (For p = 2, 3, 5 and 7 it gives 3, 7, 31 and 127, all prime.)
    counterexample: "11"
  - id: some-composite
    kind: truefalse
    title: The other side
    concept: exists
    says: There is a natural number n for which n! + 1 is not prime.
    statement: ": ∃ n : ℕ, ¬ Nat.Prime (Nat.factorial n + 1)"
    truth: true
    why: The counterexample from the first claim, n = 4, is such an n.
    solution: |
      use 4
      norm_num [Nat.factorial]
---

In Level 0, n² + n + 41 was prime forty times in a row and then failed. That lesson's point was that checking cases is not a proof. This one is about the habit that comes from it: **before you try to prove a claim, try to break it.** A proof of a false claim does not exist, and you can spend a long time looking for one. A few minutes of trying cases first is cheap.

The question is where to look.

## The problem

Write n! (n factorial) for 1 × 2 × … × n, with 0! = 1. Then n! + 1 looks like a good source of primes:

- n = 0: 0! + 1 = 2, prime.
- n = 1: 1! + 1 = 2, prime.
- n = 2: 2! + 1 = 3, prime.
- n = 3: 3! + 1 = 7, prime.

Is n! + 1 prime for every n? Do not reach for a proof. Try the next case.

```exercise
id: factorial-plus-one
```

The next case was enough. Most false claims do not hide as well as n² + n + 41: they fail early, if you look.

## Where to look

**The edges.** 0 and 1 are where many claims about natural numbers break, because they behave unlike the rest: 0 times anything is 0, 1 times anything is itself. Try them first.

```exercise
id: squares-beat
```

**The shape of the claim.** A claim that something is prime fails at a number that factors. If a small prime such as 3 or 5 divides the formula's value for some n, that n is the place to look. Here, go on past the first few even numbers.

```exercise
id: even-squares
```

**Further than feels necessary.** A claim can hold for a handful of cases and fail at the next one. This one held for the first four primes.

```exercise
id: mersenne
```

## The other side

A claim "for every n, P(n)" that fails has a mirror that holds: "there is an n for which P(n) is not true". A statement with *there exists* is proved by showing one, with `use`. The counterexample that broke the first claim is the witness for this one.

```exercise
id: some-composite
```

After `use 4` the goal is about the number 4! + 1. `norm_num [Nat.factorial]` works out the factorial and decides that 25 is not prime.

## What to do with a claim

1. **Test small cases.** 0, 1, 2, and a few more.
2. **Test the edges and the special shapes.** Where would the claim be most likely to fail?
3. **If you find a counterexample, stop.** The claim is false, and the counterexample is the proof that it is.
4. **If nothing breaks, ask why.** A claim that survives is worth proving, and the reason it survives is often the start of the proof.

## What you used

- A for-all claim is refuted by a single counterexample.
- Look first at 0 and 1, then at numbers where the claim's shape suggests a failure, then further on.
- The opposite of "for all n, P(n)" is "there exists n, not P(n)", proved with `use`.
- `norm_num` and `decide` can decide whether a particular number is prime.
