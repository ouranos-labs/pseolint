import { load } from "cheerio";
import type { FixManifest } from "../../orchestrator/finish-tool.js";
import { fail, VALID, type ValidationResult } from "./types.js";

type PageChange = FixManifest["pages"][number]["changes"][number];

const REQUIRED_PROPERTIES_BY_TYPE: Record<string, string[]> = {
  Article: ["headline", "datePublished", "author"],
  NewsArticle: ["headline", "datePublished", "author"],
  BlogPosting: ["headline", "datePublished", "author"],
  Product: ["name"],
  FAQPage: ["mainEntity"],
  HowTo: ["name", "step"],
  Recipe: ["name", "recipeIngredient", "recipeInstructions"],
  Event: ["name", "startDate", "location"],
  Organization: ["name"],
  LocalBusiness: ["name", "address"],
  Person: ["name"],
  BreadcrumbList: ["itemListElement"],
  VideoObject: ["name", "description", "thumbnailUrl", "uploadDate"],
};

const MARKDOWN_LEAK_RE = /(\*\*|^#{1,6}\s|`{1,3}|\[[^\]]+\]\([^)]+\))/m;
const PROMO_CTA_RE = /\b(buy now|click here|sign up|subscribe|limited time|act now|don'?t miss|shop now)\b/i;

const UNSAFE_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "style",
  "link",
  "meta",
  "base",
]);
const UNSAFE_ATTR_VALUE_RE = /^\s*(javascript|data|vbscript):/i;

function jsonLdTypesOf(block: Record<string, unknown>): string[] {
  const t = block["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

/** Schema.org required-property check for proposed JSON-LD blocks. */
export function validateAddJsonLd(c: Extract<PageChange, { type: "add_jsonld" }>): ValidationResult {
  if (typeof c.block !== "object" || c.block === null) {
    return fail("add_jsonld: block must be a JSON object");
  }
  const block = c.block as Record<string, unknown>;
  if (block["@context"] === undefined) {
    return fail("add_jsonld: missing @context");
  }
  const types = jsonLdTypesOf(block);
  if (types.length === 0) {
    return fail("add_jsonld: missing or invalid @type");
  }
  for (const t of types) {
    const required = REQUIRED_PROPERTIES_BY_TYPE[t];
    if (!required) continue;
    const missing = required.filter((p) => block[p] === undefined);
    if (missing.length > 0) {
      return fail(`add_jsonld: ${t} missing required properties: ${missing.join(", ")}`);
    }
  }
  return VALID;
}

export function validateReplaceH1(c: Extract<PageChange, { type: "replace_h1" }>): ValidationResult {
  if (!c.after.trim()) return fail("replace_h1: after-text is empty");
  if (c.after.length > 200) return fail(`replace_h1: after-text too long (${c.after.length} > 200 chars)`);
  if (MARKDOWN_LEAK_RE.test(c.after)) return fail("replace_h1: after-text contains markdown syntax");
  if (c.after === c.before) return fail("replace_h1: after-text identical to before-text");
  return VALID;
}

export function validateRewriteMeta(c: Extract<PageChange, { type: "rewrite_meta" }>): ValidationResult {
  if (!c.after.trim()) return fail(`rewrite_meta[${c.field}]: after-text is empty`);
  if (MARKDOWN_LEAK_RE.test(c.after)) return fail(`rewrite_meta[${c.field}]: after-text contains markdown syntax`);
  if (c.field === "title") {
    if (c.after.length < 10) return fail(`rewrite_meta[title]: too short (${c.after.length} < 10 chars)`);
    if (c.after.length > 70) return fail(`rewrite_meta[title]: too long (${c.after.length} > 70 chars)`);
  } else if (c.field === "description") {
    if (c.after.length < 50) return fail(`rewrite_meta[description]: too short (${c.after.length} < 50 chars)`);
    if (c.after.length > 160) return fail(`rewrite_meta[description]: too long (${c.after.length} > 160 chars)`);
  }
  return VALID;
}

/**
 * HTML-safety check using a cheerio-based allowlist. Rejects script/iframe/
 * object/embed/form/style elements and any href/src that uses
 * javascript:/data:/vbscript: schemes. Defense in depth: the LLM-generated
 * patch is being prepared for paste into a CMS, not auto-applied, but a
 * malicious patch in a public manifest is still a footgun.
 */
export function validateAddFaqBlock(c: Extract<PageChange, { type: "add_faq_block" }>): ValidationResult {
  if (!c.html.trim()) return fail("add_faq_block: html is empty");

  let $;
  try {
    $ = load(c.html, null, false);
  } catch (e) {
    return fail(`add_faq_block: html could not be parsed (${e instanceof Error ? e.message : String(e)})`);
  }

  // Helper closures: return the offending value or null. Cleaner than
  // mutating an outer variable inside cheerio's `.each` callback (TS
  // control-flow analysis can't see callback side effects, so the post-
  // loop value gets narrowed to `never`).
  const findUnsafeTag = (): string | null => {
    const matches: string[] = [];
    $("*").each((_, el) => {
      const tag = ((el as { tagName?: string }).tagName ?? "").toLowerCase();
      if (UNSAFE_TAGS.has(tag)) matches.push(tag);
    });
    return matches[0] ?? null;
  };
  const findUnsafeAttr = (): string | null => {
    const matches: string[] = [];
    $("[href], [src]").each((_, el) => {
      const attribs = (el as { attribs?: Record<string, string> }).attribs ?? {};
      const href = attribs.href ?? attribs.src ?? "";
      if (UNSAFE_ATTR_VALUE_RE.test(href)) matches.push(href);
    });
    return matches[0] ?? null;
  };

  const unsafeTag = findUnsafeTag();
  if (unsafeTag) return fail(`add_faq_block: unsafe tag <${unsafeTag}>`);

  const unsafeAttr = findUnsafeAttr();
  if (unsafeAttr) return fail(`add_faq_block: unsafe href/src scheme (${unsafeAttr.slice(0, 30)})`);

  return VALID;
}

export function validateRewriteIntro(c: Extract<PageChange, { type: "rewrite_intro" }>): ValidationResult {
  const after = c.after.trim();
  if (after.length < 50) return fail(`rewrite_intro: too short (${after.length} < 50 chars)`);
  if (after.length > 500) return fail(`rewrite_intro: too long (${after.length} > 500 chars)`);
  if (PROMO_CTA_RE.test(after)) return fail("rewrite_intro: contains promotional CTA language");
  if (MARKDOWN_LEAK_RE.test(after)) return fail("rewrite_intro: contains markdown syntax");
  return VALID;
}

export function validateAddInternalLink(
  c: Extract<PageChange, { type: "add_internal_link" }>,
): ValidationResult {
  let fromHost: string;
  let toHost: string;
  try {
    fromHost = new URL(c.from).hostname;
  } catch {
    return fail("add_internal_link: from is not a valid URL");
  }
  try {
    toHost = new URL(c.to).hostname;
  } catch {
    return fail("add_internal_link: to is not a valid URL");
  }
  if (fromHost !== toHost) {
    return fail(`add_internal_link: cross-domain (${fromHost} → ${toHost}); this rule emits internal links only`);
  }
  if (c.from === c.to) {
    return fail("add_internal_link: from and to are identical (would create a self-link)");
  }
  if (!c.anchor.trim()) {
    return fail("add_internal_link: anchor text is empty");
  }
  if (c.anchor.length > 100) {
    return fail(`add_internal_link: anchor text too long (${c.anchor.length} > 100 chars)`);
  }
  return VALID;
}

export function validateRemoveThinBlock(
  c: Extract<PageChange, { type: "remove_thin_block" }>,
): ValidationResult {
  const sel = c.selector.trim();
  if (!sel) return fail("remove_thin_block: selector is empty");
  // Smoke-parse via cheerio: load empty doc and call .find(selector); a
  // throw indicates a malformed selector. Doesn't catch all selector bugs
  // (e.g. dependent on actual DOM) but rejects the obvious bad ones.
  try {
    load("<html></html>")(sel);
  } catch (e) {
    return fail(`remove_thin_block: invalid selector (${e instanceof Error ? e.message : String(e)})`);
  }
  return VALID;
}

/** Dispatcher: routes a `PageChange` to its specific validator. */
export function validatePageChange(c: PageChange): ValidationResult {
  switch (c.type) {
    case "replace_h1":
      return validateReplaceH1(c);
    case "rewrite_meta":
      return validateRewriteMeta(c);
    case "add_jsonld":
      return validateAddJsonLd(c);
    case "add_faq_block":
      return validateAddFaqBlock(c);
    case "rewrite_intro":
      return validateRewriteIntro(c);
    case "add_internal_link":
      return validateAddInternalLink(c);
    case "remove_thin_block":
      return validateRemoveThinBlock(c);
  }
}
