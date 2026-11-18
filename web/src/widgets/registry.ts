import type { WidgetType } from "../../shared/registry.ts";
import { MoveList } from "./MoveList.tsx";
import { ProofState } from "./ProofState.tsx";
import type { Widget } from "./types.ts";

// Widget type (as written in a lesson's ```widget block) → component. The
// names and parameters are declared in web/shared/registry.ts; a type added
// there and not here does not compile.
export const WIDGET_COMPONENTS: Record<WidgetType, Widget> = {
  "proof-state": ProofState,
  "move-list": MoveList,
};
