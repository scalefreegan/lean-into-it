import type { ButtonHTMLAttributes, ReactNode } from "react";

// Small shared pieces. Colours come from the tokens in index.css; nothing
// here (or anywhere in src/) writes a raw hex or a dark: variant.

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" };

export function Button({ variant = "quiet", className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
        variant === "primary" ? "bg-accent text-accent-ink hover:bg-accent-hover" : "border border-line-strong bg-panel text-fg-2 hover:bg-raised",
        className,
      )}
    />
  );
}

export function Notice({ tone, children }: { tone: "bad" | "warn" | "good"; children: ReactNode }) {
  const tones = { bad: "border-bad bg-bad-soft", warn: "border-warn bg-warn-soft", good: "border-good bg-good-soft" };
  return <div className={cx("rounded-xl border px-4 py-3 text-sm text-fg", tones[tone])}>{children}</div>;
}

/** The mark of a proof-craft lesson, on the Path and its own page. */
export function CraftBadge({ className }: { className?: string }) {
  return (
    <span data-craft className={cx("inline-block rounded-md border border-line-strong px-2 py-0.5 align-middle text-xs font-semibold uppercase tracking-wide text-fg-2", className)}>
      Proof craft
    </span>
  );
}

/** A tick in a circle: solved. */
export function Tick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cx("h-5 w-5", className)}>
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      <path d="M5.5 10.4l3 3 6-6.6" fill="none" stroke="var(--panel)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A mastery score as a short bar: accent while learning, green once mastered. */
export function MasteryBar({ value, mastered, label }: { value: number; mastered: boolean; label: string }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2" data-mastery={pct} data-mastered={mastered || undefined}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-raised" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
        <span className={cx("block h-full rounded-full", mastered ? "bg-good" : "bg-accent")} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs text-fg-3">{pct}%</span>
    </span>
  );
}
