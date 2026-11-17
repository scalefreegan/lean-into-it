import type { ReactNode } from "react";

/** What a widget is given: the parameters of its block, which the loader has
 *  already checked against web/shared/registry.ts. */
export interface WidgetProps {
  params: Record<string, unknown>;
}

export type Widget = (props: WidgetProps) => ReactNode;
