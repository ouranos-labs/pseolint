import { dirname } from "node:path";

/** Directory-style cluster key: same parent path = same cluster. */
export function clusterKeyForUrl(pageUrl: string): string {
  if (/^https?:\/\//i.test(pageUrl)) {
    try {
      const u = new URL(pageUrl);
      let pathname = u.pathname;
      if (pathname.length > 1 && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }
      const path = pathname.replace(/\/[^/]+$/, "") || "/";
      const dir = path.endsWith("/") ? path : `${path}/`;
      return `${u.origin}${dir}`;
    } catch {
      return pageUrl;
    }
  }
  const dir = dirname(pageUrl);
  return dir.endsWith("\\") || dir.endsWith("/") ? dir : `${dir}\\`;
}
