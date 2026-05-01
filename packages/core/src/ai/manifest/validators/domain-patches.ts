import type { FixManifest } from "../../orchestrator/finish-tool.js";
import { fail, VALID, type ValidationResult } from "./types.js";

type DomainPatch = FixManifest["domainLevel"][number];

/**
 * robots.txt validation: parse line-by-line, require at least one
 * `User-agent:` directive, reject lines that aren't either a comment, blank,
 * or a recognized directive (User-agent, Disallow, Allow, Sitemap,
 * Crawl-delay).
 *
 * Not as strict as a real robots-parser library — but catches the failure
 * modes the LLM is most likely to produce (bad directive names, missing
 * User-agent block, accidental markdown).
 */
const RECOGNIZED_DIRECTIVE_RE = /^(user-agent|disallow|allow|sitemap|crawl-delay|host)\s*:/i;

export function validateRobotsTxt(p: DomainPatch): ValidationResult {
  const text = p.after.trim();
  if (!text) return fail("robots_txt: after-text is empty");

  const lines = text.split(/\r?\n/);
  let sawUserAgent = false;
  let lineNo = 0;
  for (const raw of lines) {
    lineNo += 1;
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (!RECOGNIZED_DIRECTIVE_RE.test(line)) {
      return fail(`robots_txt: unrecognized directive on line ${lineNo}: ${line.slice(0, 60)}`);
    }
    if (/^user-agent\s*:/i.test(line)) sawUserAgent = true;
  }
  if (!sawUserAgent) {
    return fail("robots_txt: no User-agent directive present");
  }
  return VALID;
}

/**
 * sitemap.xml validation: require a recognizable root element (`<urlset>` or
 * `<sitemapindex>`), require well-formed XML structure (matching open/close
 * tags), require each `<url>` to carry a `<loc>` child.
 *
 * Skips full XSD validation — pulling in a libxml binding for one patch
 * type isn't worth the deploy weight. The structural checks catch the
 * common LLM failure modes.
 */
const URLSET_RE = /<urlset[\s>]/i;
const SITEMAPINDEX_RE = /<sitemapindex[\s>]/i;
const URL_BLOCK_RE = /<url[\s>][\s\S]*?<\/url>/gi;
const LOC_RE = /<loc>[\s\S]*?<\/loc>/i;

export function validateSitemapXml(p: DomainPatch): ValidationResult {
  const xml = p.after.trim();
  if (!xml) return fail("sitemap_xml: after-text is empty");

  const isUrlset = URLSET_RE.test(xml);
  const isIndex = SITEMAPINDEX_RE.test(xml);
  if (!isUrlset && !isIndex) {
    return fail("sitemap_xml: missing <urlset> or <sitemapindex> root element");
  }

  // Cheap well-formed-ness check: count opening vs closing tags for the
  // root element and `<url>` blocks. Mismatch indicates malformed XML.
  if (isUrlset) {
    const opens = (xml.match(/<urlset[\s>]/gi) ?? []).length;
    const closes = (xml.match(/<\/urlset>/gi) ?? []).length;
    if (opens !== closes) {
      return fail("sitemap_xml: <urlset> open/close tag count mismatch");
    }
    const urlBlocks = xml.match(URL_BLOCK_RE) ?? [];
    if (urlBlocks.length === 0) {
      return fail("sitemap_xml: <urlset> has no <url> children");
    }
    for (const block of urlBlocks) {
      if (!LOC_RE.test(block)) {
        return fail("sitemap_xml: <url> block missing <loc>");
      }
    }
  } else {
    const opens = (xml.match(/<sitemapindex[\s>]/gi) ?? []).length;
    const closes = (xml.match(/<\/sitemapindex>/gi) ?? []).length;
    if (opens !== closes) {
      return fail("sitemap_xml: <sitemapindex> open/close tag count mismatch");
    }
  }

  return VALID;
}

/**
 * canonical_strategy is freeform guidance text describing how the site
 * should structure its canonicals (e.g. "always self-canonical except for
 * paginated views which point to page 1"). Validation just rejects empty
 * or trivially-short text — content quality is the LLM's call.
 */
export function validateCanonicalStrategy(p: DomainPatch): ValidationResult {
  const after = p.after.trim();
  if (after.length < 30) {
    return fail(`canonical_strategy: too short (${after.length} < 30 chars) — needs concrete guidance`);
  }
  return VALID;
}

export function validateDomainPatch(p: DomainPatch): ValidationResult {
  switch (p.type) {
    case "robots_txt":
      return validateRobotsTxt(p);
    case "sitemap_xml":
      return validateSitemapXml(p);
    case "canonical_strategy":
      return validateCanonicalStrategy(p);
  }
}
