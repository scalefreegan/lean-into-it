import type { WidgetType } from "../../shared/registry.ts";
import { MoveList } from "./MoveList.tsx";
import { NumberLine } from "./NumberLine.tsx";
import { Plot } from "./Plot.tsx";
import { ProofState } from "./ProofState.tsx";
import { InductionDominoes } from "./InductionDominoes.tsx";
import { InformalFormal } from "./InformalFormal.tsx";
import { EpsilonDelta, RiemannSum, SecantTangent, SequenceLimit } from "./Limits.tsx";
import { SquareOfSum } from "./SquareOfSum.tsx";
import { TruthTable } from "./TruthTable.tsx";
import type { Widget } from "./types.ts";

// Widget type (as written in a lesson's ```widget block) → component. The
// names and parameters are declared in web/shared/registry.ts; a type added
// there and not here does not compile.
export const WIDGET_COMPONENTS: Record<WidgetType, Widget> = {
  "proof-state": ProofState,
  "move-list": MoveList,
  plot: Plot,
  "number-line": NumberLine,
  "square-of-sum": SquareOfSum,
  "truth-table": TruthTable,
  "induction-dominoes": InductionDominoes,
  "informal-formal": InformalFormal,
  "epsilon-delta": EpsilonDelta,
  "secant-tangent": SecantTangent,
  "riemann-sum": RiemannSum,
  "sequence-limit": SequenceLimit,
};
