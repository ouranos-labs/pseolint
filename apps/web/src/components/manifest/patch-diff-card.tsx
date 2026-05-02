import type { PatchDiff } from "@pseolint/core";

/**
 * Single-patch renderer. Each `PatchDiff` kind maps to a different layout:
 *   - text_replace  → side-by-side before/after blocks
 *   - html_insert   → code block with insertion-target hint
 *   - html_remove   → selector callout
 *   - file_replace  → unified-diff-style file rendering
 *   - guidance      → prose card
 *
 * Designed for owner-private manifest pages. Public-share pages (per spec
 * §11.7) should NOT render this — they get a deterministic-findings
 * paraphrase instead.
 */
export function PatchDiffCard({ diff, label }: { diff: PatchDiff; label?: string }) {
  return (
    <div className="rounded-[18px] border border-border/60 bg-card/40 p-5">
      {label && (
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      )}
      {renderBody(diff)}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{diff.reason}</p>
    </div>
  );
}

function renderBody(diff: PatchDiff): React.ReactNode {
  switch (diff.kind) {
    case "text_replace":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Before · {fieldLabel(diff.field)}
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-[10px] border border-border/40 bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
              {diff.before || "(empty)"}
            </pre>
          </div>
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-success">
              After · {fieldLabel(diff.field)}
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-[10px] border border-success/30 bg-success/5 p-3 text-xs leading-relaxed text-foreground">
              {diff.after}
            </pre>
          </div>
        </div>
      );

    case "html_insert":
      return (
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            Insert into &lt;{diff.target === "after_h1" ? "main, after H1" : diff.target}&gt;
          </div>
          <div className="mb-1 text-xs font-medium text-foreground">{diff.description}</div>
          <pre className="whitespace-pre-wrap break-words rounded-[10px] border border-success/30 bg-success/5 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {diff.html}
          </pre>
        </div>
      );

    case "html_remove":
      return (
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-1 font-mono text-[10px] text-destructive">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
            Remove
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-[10px] border border-destructive/30 bg-destructive/5 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {diff.selector}
          </pre>
        </div>
      );

    case "file_replace":
      return (
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
            File · {diff.path}
          </div>
          {diff.before !== null && (
            <details className="mb-2">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Show current contents
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words rounded-[10px] border border-border/40 bg-background/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {diff.before}
              </pre>
            </details>
          )}
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-success">
            Replace with
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-[10px] border border-success/30 bg-success/5 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {diff.after}
          </pre>
        </div>
      );

    case "guidance":
      return (
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
            Guidance · {diff.topic}
          </div>
          <p className="text-sm leading-relaxed text-foreground">{diff.text}</p>
        </div>
      );
  }
}

function fieldLabel(field: "h1" | "title" | "meta_description" | "intro"): string {
  switch (field) {
    case "h1":
      return "<h1>";
    case "title":
      return "<title>";
    case "meta_description":
      return "<meta name=description>";
    case "intro":
      return "Opening paragraph";
  }
}
