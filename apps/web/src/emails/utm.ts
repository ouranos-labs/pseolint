/**
 * Tag an outbound email link so its clicks land in analytics as a real source.
 *
 * Lifecycle email IS the Pro retention loop (monitoring alerts, weekly digest),
 * and untagged links arrive as direct traffic, indistinguishable from someone
 * typing the URL. Pageviews already parse UTM, so tagging is the whole fix.
 *
 * Only ever call this on OUR urls. The user's own site (`sourceUrl` on an
 * alert) must stay untouched, and magic links are left alone on purpose:
 * appending params to a URL an auth provider may match exactly is a real risk
 * for no gain, since `signin_started` already covers that step.
 */
export function utm(url: string, campaign: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "email");
    u.searchParams.set("utm_medium", "lifecycle");
    u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    return url; // relative or malformed: not ours to rewrite
  }
}
