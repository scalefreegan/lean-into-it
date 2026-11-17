import { EXERCISE_KEYS, EXERCISES, isWidget, WIDGETS, type ParamSpecs, type WidgetType } from "../../shared/registry.ts";
import { href } from "../router.ts";
import { Notice } from "../ui.tsx";
import { RenderWidget } from "../widgets/RenderWidget.tsx";

// Everything a lesson can be built from, read from the registry
// (web/shared/registry.ts): each widget drawn with its example parameters,
// and each exercise kind with the fields it takes. A reference for whoever
// writes lessons; open #/gallery, or #/gallery/<widget> for one widget.

/** A widget block as it would be written in a lesson file. */
function asBlock(type: string, params: Record<string, unknown>): string {
  const lines = [`type: ${type}`];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.includes("\n")) lines.push(`${key}: |`, ...value.replace(/\n+$/, "").split("\n").map((l) => (l ? `  ${l}` : "")));
    else lines.push(`${key}: ${Array.isArray(value) ? `[${value.join(", ")}]` : String(value)}`);
  }
  return ["```widget", ...lines, "```"].join("\n");
}

/** A registry sentence, with its `code` spans set as code. */
function Doc({ text }: { text: string }) {
  return <>{text.split("`").map((part, i) => (i % 2 ? <code key={i} className="lean rounded bg-raised px-1 text-[0.92em] text-fg">{part}</code> : part))}</>;
}

function Params({ params }: { params: ParamSpecs }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line-strong text-xs uppercase tracking-wide text-fg-3">
            <th className="py-1.5 pr-4 font-semibold">Parameter</th>
            <th className="py-1.5 pr-4 font-semibold">Kind</th>
            <th className="py-1.5 font-semibold">Meaning</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(params).map(([name, p]) => (
            <tr key={name} className="border-b border-line align-top">
              <td className="py-1.5 pr-4 font-mono text-fg">
                {name}
                {p.required && <span className="ml-1.5 font-sans text-xs font-semibold text-accent">required</span>}
              </td>
              <td className="py-1.5 pr-4 font-mono text-fg-2">{p.type.replace(/^enum(\[\])?:/, (_, many: string | undefined) => (many ? "any of " : "one of ")).replaceAll("|", ", ")}</td>
              <td className="py-1.5 text-fg-2">
                <Doc text={p.doc} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Gallery({ only }: { only?: string }) {
  if (only && !isWidget(only)) {
    return (
      <div className="mx-auto max-w-[2400px]">
        <Notice tone="warn">
          There is no widget called “{only}”. <a className="font-semibold text-accent underline" href={href("gallery")}>The whole gallery</a>
        </Notice>
      </div>
    );
  }
  const types = (Object.keys(WIDGETS) as WidgetType[]).filter((t) => !only || t === only);
  return (
    <div className="mx-auto flex max-w-[2400px] flex-col gap-10" data-gallery>
      <header>
        <h1 className="text-4xl font-semibold text-fg">Gallery</h1>
        <p className="mt-2 max-w-[96ch] text-lg text-fg-2">
          What a lesson can be built from: the widgets it can embed and the kinds of exercise it can set. All of it is read from the registry, so this page cannot fall behind the app.
        </p>
      </header>

      <section className="flex flex-col gap-8">
        <h2 className="text-2xl font-semibold text-fg">Widgets</h2>
        {types.map((type) => (
          <section key={type} id={type} data-gallery-widget={type} className="flex flex-col gap-3">
            <div>
              <h3 className="font-mono text-xl font-semibold text-fg">
                <a className="underline-offset-2 hover:underline" href={href("gallery", type)}>
                  {type}
                </a>
              </h3>
              <p className="mt-1 max-w-[96ch] text-fg-2">
                <Doc text={WIDGETS[type].doc} />
              </p>
              <Params params={WIDGETS[type].params} />
            </div>
            {WIDGETS[type].examples.map((params, i) => (
              <div key={i} className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <pre className="lean overflow-x-auto rounded-xl border border-line bg-raised px-4 py-3 text-sm leading-6 text-fg-2">{asBlock(type, params)}</pre>
                <RenderWidget type={type} params={params} />
              </div>
            ))}
          </section>
        ))}
      </section>

      {!only && (
        <section className="flex flex-col gap-8">
          <h2 className="text-2xl font-semibold text-fg">Exercise kinds</h2>
          {Object.entries(EXERCISES).map(([kind, spec]) => (
            <section key={kind} data-gallery-exercise={kind}>
              <h3 className="text-xl font-semibold text-fg">
                <span className="font-mono">{kind}</span> <span className="text-base font-normal text-fg-3">· shown as “{spec.label}”</span>
              </h3>
              <p className="mt-1 max-w-[96ch] text-fg-2">
                <Doc text={spec.doc} />
              </p>
              <p className="mt-2 text-sm text-fg-3">
                Every exercise also has <span className="font-mono">{EXERCISE_KEYS.join(", ")}</span>. An exercise is declared in the lesson's frontmatter and placed in the body by its id.
              </p>
              <Params params={spec.params} />
            </section>
          ))}
        </section>
      )}
    </div>
  );
}
