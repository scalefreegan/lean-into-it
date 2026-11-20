---
id: programs-2-strengthen
title: Prove more to prove less
track: programs
level: 2
order: 6
craft: true
concepts: [list-induction]
summary: A sum written with an accumulator cannot be proved by plain induction, because the accumulator changes at every step. Prove the stronger statement for every accumulator, then get the original from it.
given: |
  @[simp] def total : List ℕ → ℕ
    | [] => 0
    | x :: xs => x + total xs

  @[simp] def sumAcc : List ℕ → ℕ → ℕ
    | [], acc => acc
    | x :: xs, acc => sumAcc xs (acc + x)
exercises:
  - id: stuck
    kind: predict
    title: Where the direct proof stops
    says: Try induction directly on sumAcc xs 0 = total xs. After the base case, what does simp leave in the step?
    statement: "(xs : List ℕ) : sumAcc xs 0 = total xs"
    before: |
      induction' xs with x xs ih
      rfl
    move: simp
    options:
      - "case cons\nx : ℕ\nxs : List ℕ\nih : sumAcc xs 0 = total xs\n⊢ sumAcc xs x = x + total xs"
      - "case cons\nx : ℕ\nxs : List ℕ\nih : sumAcc xs 0 = total xs\n⊢ sumAcc xs 0 = x + total xs"
      - "case cons\nx : ℕ\nxs : List ℕ\nih : sumAcc xs x = total xs\n⊢ sumAcc xs x = x + total xs"
    solution: "case cons\nx : ℕ\nxs : List ℕ\nih : sumAcc xs 0 = total xs\n⊢ sumAcc xs x = x + total xs"
  - id: general
    title: For every starting total
    mode: typed
    says: For any list xs and any starting total acc, adding up xs onto acc gives acc plus the total of xs.
    statement: "(xs : List ℕ) (acc : ℕ) : sumAcc xs acc = acc + total xs"
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?, fun_induction, sumAcc.induct]
    solution: |
      induction xs generalizing acc with
      | nil => simp
      | cons x xs ih =>
        simp [ih]
        omega
  - id: corollary
    title: Back to the start
    mode: typed
    says: For any list xs, starting from 0 and adding up xs gives the total of xs.
    statement: "(xs : List ℕ) : sumAcc xs 0 = total xs"
    given: |
      theorem sumAcc_general (xs : List ℕ) (acc : ℕ) : sumAcc xs acc = acc + total xs := by
        induction xs generalizing acc with
        | nil => simp
        | cons x xs ih =>
          simp [ih]
          omega
    forbid: [aesop, grind, exact?, apply?, decide, hint, rw?, induction, induction', fun_induction, sumAcc.induct]
    solution: |
      rw [sumAcc_general]
      simp
---

Here are two ways to add up a list. `total` is the one from the earlier lessons: the first element plus the total of the rest. `sumAcc` is the way a loop does it. It carries a running total, the **accumulator**, adds each element to it as it goes, and hands back the running total when the list runs out.

```lean say: A definition of sum acc, from lists and a number to a number. For the empty list it gives the number. For x followed by x's it recurses on x's with the number plus x.
def sumAcc : List ℕ → ℕ → ℕ
  | [], acc => acc
  | x :: xs, acc => sumAcc xs (acc + x)
```

Worked out by hand, `sumAcc [1, 2, 3] 0` goes to `sumAcc [2, 3] 1`, then `sumAcc [3] 3`, then `sumAcc [] 6`, which is 6. A specification says it agrees with `total`: starting from 0, `sumAcc xs 0 = total xs`. That looks like an ordinary induction on a list.

## Try it, and see it stop

Do the induction on `xs`. The base case is a calculation. In the step, `simp` unfolds both sides once. What does it leave?

```exercise
id: stuck
```

Look at the goal. It is about `sumAcc xs x`: the accumulator is no longer 0, because the first element has been added to it. But the induction hypothesis `ih` is only about `sumAcc xs 0`. It is a fact about the wrong accumulator, so it does not match, and no rewriting with it will help. The proof is stuck, and no amount of cleverness with `simp` or `omega` will get it going again, because the hypothesis does not say what the step needs.

## Say more

The way out feels backwards: **prove a stronger statement.** The trouble is that `ih` talks about one accumulator. So make the statement talk about every accumulator at once. For any starting total acc, the result is acc plus the total of the list:

sumAcc xs acc = acc + total xs

This is stronger, since taking acc = 0 gives back the original. And it is easier to prove. The step now needs it for the accumulator `acc + x`, and the strengthened hypothesis has it for every accumulator, `acc + x` among them.

In Lean, say so with `generalizing`:

```lean say: Induction on x's, generalizing the accumulator. The hypothesis I H now holds for every accumulator.
induction xs generalizing acc with
| nil => …
| cons x xs ih => …
```

The words `generalizing acc` tell Lean not to fix `acc` while it sets up the induction, so `ih` comes out as "for every acc, …". Then in the step, `simp [ih]` uses it at `acc + x`, and what is left is arithmetic.

```exercise
id: general
```

## Then take the corollary

The original statement is the case acc = 0 of the one you just proved. The general theorem is on hand for this exercise as `sumAcc_general`. No induction is needed any more: rewrite with it, and tidy up.

```exercise
id: corollary
```

## What you used

- A proof by induction can get stuck because the hypothesis is too weak, a fact about one case when the step needs another.
- The cure is to prove a stronger statement: here, for every accumulator. A stronger hypothesis is more to prove at the start, and more to use in the step.
- `induction xs generalizing acc` keeps a variable open for the hypothesis.
- The original theorem comes back as a corollary: a short proof using the general one.
