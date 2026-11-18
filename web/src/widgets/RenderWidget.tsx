import type { WidgetType } from "../../shared/registry.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { WIDGET_COMPONENTS } from "./registry.ts";
import type { WidgetProps } from "./types.ts";

/** One widget, by its registered name. A widget that throws takes down only
 *  itself, not the lesson around it. */
export function RenderWidget({ type, params }: { type: WidgetType } & WidgetProps) {
  const C = WIDGET_COMPONENTS[type];
  return (
    <ErrorBoundary label={`${type} widget`}>
      {/* A widget reads its parameters once, when it starts: new parameters, new widget. */}
      <C key={JSON.stringify(params)} params={params} />
    </ErrorBoundary>
  );
}
