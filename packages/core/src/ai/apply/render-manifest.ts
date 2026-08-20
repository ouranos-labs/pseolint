import { diffManifest, type PatchDiff } from "../manifest/diff.js";
import type { FixManifest } from "../orchestrator/finish-tool.js";

/**
 * Manifest → source-edit renderer (fix-to-PR, step 1).
 *
 * `orchestrate` emits a validated {@link FixManifest} in *rendered-HTML* space:
 * every `before`/`after` is a page fragment, keyed by URL / templateId, not by
 * source file. This module maps those patches back to source files (via a
 * user-authored {@link TemplateMapping}) and splits them two ways:
 *
 *   - {@link FileEdit}: deterministic, literal find/replace we can apply
 *                             now (meta title/description, H1, robots, sitemap).
 *   - {@link ChecklistItem}: everything a human should place or word: JSON-LD /
 *                             FAQ insertions, prose rewrites, template guidance,
 *                             and anything with no mapped source file.
 *
 * Pure and I/O-free. `applyEditToContent` confirms the literal actually exists
 * in the file at apply time (interpolated templates often won't contain a
 * rendered instance) and demotes misses back to the caller.
 */

/** Route/template/file pattern → source file path. See docs spec §1 option 1. */
export type TemplateMapping = Record<string, string>;

export interface FileEdit {
  path: string;
  /** Literal text to find in the source file. `null` = create / overwrite the whole file. */
  find: string | null;
  replace: string;
  /** What field this touches: h1 | title | meta_description | robots.txt | sitemap.xml. */
  field: string;
  reason: string;
  url?: string;
}

export interface ChecklistItem {
  kind: "template" | "insertion" | "removal" | "guidance" | "generative" | "unmapped";
  path?: string;
  title: string;
  detail?: string;
  reason: string;
  url?: string;
}

export interface RenderedManifest {
  edits: FileEdit[];
  checklist: ChecklistItem[];
}

function pathnameOf(s: string): string {
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      return new URL(s).pathname;
    } catch {
      return s;
    }
  }
  return s;
}

/** Convert a route pattern (`/listing/:slug`, `/blog/[slug]`, `*`) to a matcher. */
function routeToRegExp(pattern: string): RegExp {
  const path = pathnameOf(pattern).replace(/^\/+|\/+$/g, "");
  const parts = path.split("/").map((seg) => {
    if (seg === "*" || /^\[\.\.\..+\]$/.test(seg) || /^:.*\*$/.test(seg)) return "[^?#]*";
    if (/^:.+/.test(seg) || /^\[.+\]$/.test(seg)) return "[^/]+";
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^/${parts.join("/")}/?$`);
}

/** Resolve a concrete page URL to a source file by matching mapping route keys. */
function resolvePagePath(url: string, mapping: TemplateMapping): string | undefined {
  const target = pathnameOf(url).replace(/\/+$/, "") || "/";
  for (const [key, file] of Object.entries(mapping)) {
    // Only route-shaped keys participate in URL matching.
    if (!(key.startsWith("/") || key.startsWith("http"))) continue;
    if (routeToRegExp(key).test(target) || routeToRegExp(key).test(target + "/")) return file;
  }
  return undefined;
}

function classifyPageDiff(
  d: PatchDiff,
  ctx: { url: string; path?: string },
  out: RenderedManifest,
): void {
  switch (d.kind) {
    case "text_replace":
      // Prose rewrites are the human's call on wording; plumbing fields auto-apply.
      if (d.field === "intro") {
        out.checklist.push({
          kind: "generative",
          path: ctx.path,
          url: ctx.url,
          title: "Rewrite intro",
          detail: `Before: ${d.before}\nAfter: ${d.after}`,
          reason: d.reason,
        });
      } else if (ctx.path) {
        out.edits.push({
          path: ctx.path,
          find: d.before,
          replace: d.after,
          field: d.field,
          reason: d.reason,
          url: ctx.url,
        });
      } else {
        out.checklist.push({
          kind: "unmapped",
          url: ctx.url,
          title: `Update ${d.field}: no source file mapped`,
          detail: `Before: ${d.before}\nAfter: ${d.after}`,
          reason: d.reason,
        });
      }
      break;
    case "html_insert":
      out.checklist.push({
        kind: "insertion",
        path: ctx.path,
        url: ctx.url,
        title: `Insert into ${d.target}: ${d.description}`,
        detail: d.html,
        reason: d.reason,
      });
      break;
    case "html_remove":
      out.checklist.push({
        kind: "removal",
        path: ctx.path,
        url: ctx.url,
        title: `Remove element: ${d.selector}`,
        reason: d.reason,
      });
      break;
    case "guidance":
      out.checklist.push({
        kind: "guidance",
        url: ctx.url,
        title: `Guidance: ${d.topic}`,
        detail: d.text,
        reason: d.reason,
      });
      break;
    case "file_replace":
      // Only surfaces at domain level in practice; handled there.
      break;
  }
}

/**
 * Render a validated manifest into applicable edits + a human checklist.
 * Pure. Call `validateManifest` first and drop failures before rendering.
 */
export function renderManifest(manifest: FixManifest, mapping: TemplateMapping): RenderedManifest {
  const diff = diffManifest(manifest);
  const out: RenderedManifest = { edits: [], checklist: [] };

  for (const page of diff.pages) {
    const path = resolvePagePath(page.url, mapping);
    for (const d of page.diffs) classifyPageDiff(d, { url: page.url, path }, out);
  }

  // Template fixes are guided, not auto-edited: the manifest's before/after are
  // rendered instances (e.g. "Plumbers in Austin"), not the interpolated source.
  for (const t of diff.templates) {
    out.checklist.push({
      kind: "template",
      path: mapping[t.templateId],
      title: `Template ${t.templateId} (${t.affectedUrlCount} URLs): ${t.recommendation}`,
      detail: mapping[t.templateId] ? undefined : `No source file mapped for "${t.templateId}".`,
      reason: `Fix once, fix ${t.affectedUrlCount} pages.`,
    });
  }

  for (const d of diff.domainLevel) {
    if (d.kind === "file_replace") {
      const fileKey = d.path.replace(/^\//, ""); // "robots.txt" | "sitemap.xml"
      const path = mapping[fileKey];
      if (path) {
        out.edits.push({ path, find: d.before, replace: d.after, field: fileKey, reason: d.reason });
      } else {
        out.checklist.push({
          kind: "unmapped",
          title: `Update ${fileKey}: no source path mapped`,
          detail: d.after,
          reason: d.reason,
        });
      }
    } else if (d.kind === "guidance") {
      out.checklist.push({
        kind: "guidance",
        title: `Guidance: ${d.topic}`,
        detail: d.text,
        reason: d.reason,
      });
    }
  }

  return out;
}

/**
 * Apply one edit to file content. `find: null` overwrites/creates the file.
 * Otherwise the literal must be present: a miss returns `applied: false` so the
 * caller can demote it to the checklist (interpolated source often lacks the
 * rendered instance). Replaces the first occurrence only.
 */
export function applyEditToContent(
  content: string,
  edit: FileEdit,
): { applied: boolean; content: string } {
  if (edit.find === null) return { applied: true, content: edit.replace };
  if (!content.includes(edit.find)) return { applied: false, content };
  return { applied: true, content: content.replace(edit.find, edit.replace) };
}
