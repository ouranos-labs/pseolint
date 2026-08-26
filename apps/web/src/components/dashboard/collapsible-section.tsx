import type { ReactNode } from "react";

/**
 * A workspace card that collapses.
 *
 * Native <details>/<summary>, not a disclosure library and not a client
 * component: the toggle works before hydration (and with JS off), the open
 * state survives without React holding it, and keyboard + screen-reader
 * semantics come from the element instead of aria-expanded wiring we would own
 * forever. Chrome matches the plain `<section>` cards it replaces so a mixed
 * page reads as one surface.
 *
 * `meta` is the point of the component, not decoration: a collapsed section
 * must still show its headline signal, otherwise collapsing trades visual noise
 * for a page you cannot skim. Put the number in `meta` and the detail in the
 * body.
 *
 * ponytail: `open` is an uncontrolled initial attribute — no onToggle, no state
 * mirror. Add persistence only if users actually ask for their layout to be
 * remembered across visits.
 */
export function CollapsibleSection({
  title,
  description,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  /** Headline signal kept visible while collapsed (a count, a grade, a status). */
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-[18px] border border-border/60 bg-card/40">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-[18px] p-5 outline-none transition-colors hover:bg-card/60 focus-visible:ring-2 focus-visible:ring-primary/60 [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className="size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90"
        >
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {description ? (
            <span className="text-[11px] text-muted-foreground">{description}</span>
          ) : null}
        </span>
        {meta ? <span className="ml-auto shrink-0 pl-3 text-right">{meta}</span> : null}
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
