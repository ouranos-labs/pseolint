const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_DIGITS_RE = /^\d+$/;

function generalizeSegment(seg: string): string {
  if (!seg) return seg;
  if (ALL_DIGITS_RE.test(seg)) return ":num";
  if (UUID_RE.test(seg) || ULID_RE.test(seg)) return ":id";
  if (DATE_RE.test(seg)) return ":date";
  const hyphenCount = (seg.match(/-/g) ?? []).length;
  if (hyphenCount >= 2) return ":slug";
  return seg;
}

export function inferUrlTemplate(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  if (pathname === "" || pathname === "/") return "/";
  const trimmed = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const segments = trimmed.split("/").slice(1).map(generalizeSegment);
  return "/" + segments.join("/");
}
