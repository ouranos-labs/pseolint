import type { FixManifest } from "../orchestrator/finish-tool.js";

type PageChange = FixManifest["pages"][number]["changes"][number];
type DomainPatch = FixManifest["domainLevel"][number];

/**
 * Structured patch diff. Each manifest change maps to one of these,
 * which downstream consumers (web UI, CLI, GitHub-PR generator) render
 * differently:
 *   - text_replace → before/after blocks side-by-side, copy-paste UI
 *   - html_insert  → HTML snippet to paste into the named region
 *   - html_remove  → CSS selector to delete
 *   - file_replace → full-file diff (robots.txt / sitemap.xml)
 *   - guidance     → freeform prose (canonical_strategy)
 *
 * Kept deliberately narrow — not a unified-diff library. The manifest
 * patches are paste-into-CMS-friendly outputs, not source-level diffs.
 */
export type PatchDiff =
  | {
      kind: "text_replace";
      field: "h1" | "title" | "meta_description" | "intro";
      before: string;
      after: string;
      reason: string;
    }
  | {
      kind: "html_insert";
      target: "head" | "body" | "after_h1";
      description: string;
      html: string;
      reason: string;
    }
  | {
      kind: "html_remove";
      selector: string;
      reason: string;
    }
  | {
      kind: "file_replace";
      path: string;
      before: string | null;
      after: string;
      reason: string;
    }
  | {
      kind: "guidance";
      topic: "canonical_strategy";
      text: string;
      reason: string;
    };

/** HTML-escape a string for safe interpolation into attribute or text content. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeJsonLd(block: object): string {
  return `<script type="application/ld+json">\n${JSON.stringify(block, null, 2)}\n</script>`;
}

/**
 * Convert a single page-change into a `PatchDiff`. Pure transformation —
 * does not validate (use `validatePageChange` for that). The two should
 * be called in sequence at manifest finalization: validate first, drop
 * failures, then diff the survivors.
 */
export function diffPageChange(c: PageChange): PatchDiff {
  switch (c.type) {
    case "replace_h1":
      return {
        kind: "text_replace",
        field: "h1",
        before: c.before,
        after: c.after,
        reason: c.reason,
      };
    case "rewrite_meta":
      return {
        kind: "text_replace",
        field: c.field === "title" ? "title" : "meta_description",
        before: c.before,
        after: c.after,
        reason: c.reason,
      };
    case "add_jsonld":
      return {
        kind: "html_insert",
        target: "head",
        description: `JSON-LD block (@type: ${
          (() => {
            const t = (c.block as Record<string, unknown>)["@type"];
            if (typeof t === "string") return t;
            if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string").join(", ");
            return "unknown";
          })()
        })`,
        html: serializeJsonLd(c.block),
        reason: c.reason,
      };
    case "add_faq_block":
      return {
        kind: "html_insert",
        target: "body",
        description: "FAQ block",
        html: c.html,
        reason: c.reason,
      };
    case "rewrite_intro":
      return {
        kind: "text_replace",
        field: "intro",
        before: c.before,
        after: c.after,
        reason: c.reason,
      };
    case "add_internal_link":
      // Escape both anchor text and href to prevent XSS in the rendered
      // snippet. The validator already enforces same-host + non-empty
      // anchor; this is defense in depth at the diff layer.
      return {
        kind: "html_insert",
        target: "after_h1",
        description: `Internal link → ${c.to}`,
        html: `<a href="${escapeHtml(c.to)}">${escapeHtml(c.anchor)}</a>`,
        reason: c.reason,
      };
    case "remove_thin_block":
      return {
        kind: "html_remove",
        selector: c.selector,
        reason: c.reason,
      };
  }
}

/** Convert a single domain patch into a `PatchDiff`. */
export function diffDomainPatch(p: DomainPatch): PatchDiff {
  switch (p.type) {
    case "robots_txt":
      return {
        kind: "file_replace",
        path: "/robots.txt",
        before: p.before,
        after: p.after,
        reason: p.reason,
      };
    case "sitemap_xml":
      return {
        kind: "file_replace",
        path: "/sitemap.xml",
        before: p.before,
        after: p.after,
        reason: p.reason,
      };
    case "canonical_strategy":
      return {
        kind: "guidance",
        topic: "canonical_strategy",
        text: p.after,
        reason: p.reason,
      };
  }
}

export interface ManifestDiff {
  pages: Array<{ url: string; diffs: PatchDiff[] }>;
  templates: Array<{
    templateId: string;
    affectedUrlCount: number;
    recommendation: string;
    examples: Array<{ url: string; diffs: PatchDiff[] }>;
  }>;
  domainLevel: PatchDiff[];
}

/**
 * Walk every patch in a manifest and produce a structured-diff projection.
 * Mirrors the manifest's tree structure so the UI can render side-by-side
 * (page list / template clusters / domain-level), each populated with
 * already-typed patch diffs.
 */
export function diffManifest(manifest: FixManifest): ManifestDiff {
  return {
    pages: manifest.pages.map((p) => ({
      url: p.url,
      diffs: p.changes.map(diffPageChange),
    })),
    templates: manifest.templates.map((t) => ({
      templateId: t.templateId,
      affectedUrlCount: t.affectedUrlCount,
      recommendation: t.recommendation,
      examples: t.examples.map((e) => ({
        url: e.url,
        diffs: e.changes.map(diffPageChange),
      })),
    })),
    domainLevel: manifest.domainLevel.map(diffDomainPatch),
  };
}
