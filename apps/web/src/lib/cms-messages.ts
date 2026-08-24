export type CmsKind = "webflow" | "wordpress";

const WEBFLOW_URL = [/\/collections\//i, /\?collection=/i];
const WORDPRESS_URL = [/\/category\//i, /\/tag\//i, /\/\?p=/i];
const WEBFLOW_HTML = [/webflow\.com\/api/i, /data-wf-/i];
const WORDPRESS_HTML = [/wp-content/i, /wp-includes/i];

export function detectCms(pageUrl: string, html?: string): CmsKind | null {
  const webUrl = WEBFLOW_URL.some((r) => r.test(pageUrl));
  const wpUrl = WORDPRESS_URL.some((r) => r.test(pageUrl));
  if (webUrl && !wpUrl) return "webflow";
  if (wpUrl && !webUrl) return "wordpress";
  if (webUrl && wpUrl) {
    // collision; disambiguate via HTML hint
    if (html && WORDPRESS_HTML.some((r) => r.test(html))) return "wordpress";
    if (html && WEBFLOW_HTML.some((r) => r.test(html))) return "webflow";
    return null;
  }
  // no URL patterns matched; try HTML hints as a last resort
  if (html) {
    if (WORDPRESS_HTML.some((r) => r.test(html))) return "wordpress";
    if (WEBFLOW_HTML.some((r) => r.test(html))) return "webflow";
  }
  return null;
}

export function rewriteMessageForCms(
  original: string,
  _ruleId: string,
  cms: CmsKind | null,
): string {
  if (!cms) return original;
  if (cms === "webflow") return `In your Webflow Collection: ${original}`;
  if (cms === "wordpress") return `In your WordPress Post Type / Taxonomy: ${original}`;
  return original;
}
