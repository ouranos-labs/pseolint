/**
 * Card thumbnail. Renders the audited site's OG image when captured, otherwise
 * a branded gradient + first letter of the host so the card still has visual
 * identity. Plain <img> (not Next/Image) — we don't want to allowlist arbitrary
 * audited hosts as remote patterns. `referrerPolicy=no-referrer` so we don't
 * leak the visitor's referer to every audited domain on first paint.
 */
export function SiteThumbnail({
  host,
  imageUrl,
}: {
  host: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      <div className="aspect-[16/10] overflow-hidden rounded-[14px] border border-border/40 bg-secondary/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`${host} preview`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  const initial = host.replace(/^www\./, "").charAt(0).toUpperCase();
  return (
    <div className="grid aspect-[16/10] place-items-center overflow-hidden rounded-[14px] border border-border/40 bg-gradient-to-br from-secondary/50 via-secondary/20 to-card/60">
      <span
        className="font-mono text-4xl font-semibold text-muted-foreground/60"
        aria-hidden
      >
        {initial}
      </span>
    </div>
  );
}
