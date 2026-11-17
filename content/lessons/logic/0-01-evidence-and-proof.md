---
id: logic-0-evidence-and-proof
title: Evidence is not proof
track: logic
level: 0
order: 1
concepts: [evidence-and-proof]
summary: A claim about every number cannot be settled by checking some of them. A pattern that holds forty times in a row, and then breaks.
exercises:
  - id: check-a-case
    title: Check one case
    mode: board
    says: "When n is 5, the number n² + n + 41 is prime."
    statement: ": Nat.Prime (5 ^ 2 + 5 + 41)"
    moves: [norm_num]
    solution: |
      norm_num
  - id: last-good-case
    title: Check a later case
    mode: board
    says: "When n is 39, the number n² + n + 41 is prime."
    statement: ": Nat.Prime (39 ^ 2 + 39 + 41)"
    moves: [norm_num]
    solution: |
      norm_num
  - id: it-factors
    title: The fortieth case
    mode: board
    says: "When n is 40, the number n² + n + 41 is 41 × 41."
    statement: ": 40 ^ 2 + 40 + 41 = 41 * 41"
    moves: [norm_num]
    solution: |
      norm_num
  - id: it-breaks
    title: The pattern breaks
    mode: board
    says: "When n is 40, the number n² + n + 41 is not prime."
    statement: ": ¬ Nat.Prime (40 ^ 2 + 40 + 41)"
    moves: [norm_num]
    solution: |
      norm_num
---

A **claim** is a sentence that is either true or false. "7 is prime" is a claim. So is "every even number bigger than 2 is the sum of two primes". The first is about one number, and you can settle it by checking. The second is about infinitely many numbers at once, and no amount of checking will ever reach the end of them.

This lesson is about that gap.

## A promising pattern

Take a whole number n and work out n² + n + 41.

- n = 0 gives 41, a prime.
- n = 1 gives 43, a prime.
- n = 2 gives 47, a prime.
- n = 3 gives 53, a prime.

It keeps going. So here is a claim: **for every whole number n, the number n² + n + 41 is prime.**

Check a case yourself. The box below holds one statement, written the way Lean writes it. `Nat.Prime` means "is a prime number" and `5 ^ 2` means 5². The move **norm_num** tells Lean to calculate.

```exercise
id: check-a-case
```

Lean did not take your word for it, and it did not take mine. It worked out 5² + 5 + 41 = 71 and confirmed that 71 has no divisors other than 1 and itself.

The pattern holds for n = 6, 7, 8 and on, for a long time. Here is n = 39.

```exercise
id: last-good-case
```

That is forty cases in a row, n = 0 up to n = 39, every one of them prime. Most people would be convinced by now.

## Where it breaks

Try n = 40.

```exercise
id: it-factors
```

So 40² + 40 + 41 is 41 × 41. A number that is 41 times 41 is certainly not prime.

```exercise
id: it-breaks
```

The symbol `¬` is read "not". You have just proved that the claim "for every n, n² + n + 41 is prime" is **false**. One case where it fails is enough. Such a case is called a **counterexample**.

> Checking cases can show that a claim about all numbers is false: one counterexample does it. Checking cases can never show that it is true.

## It can break much later than that

Forty cases is not many. But there is no number of cases that makes you safe.

In 1919 George Pólya noticed a pattern in how numbers factor into primes, and it became known as the Pólya conjecture. It was checked for every number anyone tried, into the millions. It is false. The first number at which it fails is 906,150,257.

Other claims have been checked much further than that and are still open. The claim from the top of this page, that every even number bigger than 2 is the sum of two primes, is called Goldbach's conjecture. Computers have confirmed it for every even number up to 4,000,000,000,000,000,000. Nobody knows whether it is true.

So a claim can be in one of three states:

- **Proved.** There is an argument that covers every case at once.
- **Refuted.** Someone found a counterexample.
- **Open.** Neither has happened yet, however much evidence has piled up.

## So what is a proof?

A **proof** is an argument that leaves no case out. It does not say "I tried a lot of them". It says "here is why it must be so, whichever one you pick".

The rest of this course is about how such arguments are built, one step at a time, and how a computer can check that every step is allowed. You have already seen the smallest example: Lean confirming a calculation. Next comes the shape every proof has: some facts you start with, and a goal you want to reach.
