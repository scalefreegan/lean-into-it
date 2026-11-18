import type { ReactNode } from "react";
import type { Exercise } from "../../shared/content.ts";

/** What an exercise of any kind is given by the lesson page. */
export interface ExerciseProps {
  lessonId: string;
  exercise: Exercise;
  /** The answer that solved it before, when it has been solved. */
  solution?: string;
  onSolved: (body: string) => void;
}

export type ExerciseComponent = (props: ExerciseProps) => ReactNode;
