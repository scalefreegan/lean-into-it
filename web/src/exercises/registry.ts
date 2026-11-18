import type { ExerciseKind } from "../../shared/registry.ts";
import { ProveIt } from "./ProveIt.tsx";
import type { ExerciseComponent } from "./types.ts";

// Exercise kind (an exercise's `kind:` in a lesson's frontmatter) →
// component. The kinds and their parameters are declared in
// web/shared/registry.ts; a kind added there and not here does not compile.
export const EXERCISE_COMPONENTS: Record<ExerciseKind, ExerciseComponent> = {
  prove: ProveIt,
};
