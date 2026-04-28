/**
 * Server-renderable static snapshot of the RuleRing logo.
 *
 * Mirrors the in-app `RuleRing` component (rule-ring.tsx) but as a
 * pure-JSX, hooks-free, Satori-compatible div tree so it can render
 * inside `next/og` ImageResponse for favicons, apple touch icons,
 * and Open Graph cards.
 *
 * The "fired" indices are a hand-picked, asymmetric constellation that
 * reads as intentional brand iconography — not a random subset.
 */

const BG = "hsl(222, 14%, 9%)"; // --background
const PRIMARY = "hsl(158, 64%, 52%)"; // --primary
const MUTED = "hsl(215, 14%, 65%)"; // --muted-foreground

const TOTAL = 24;
const FIRED = new Set([2, 6, 11, 17, 21]);

export const BRAND_BG = BG;
export const BRAND_PRIMARY = PRIMARY;
export const BRAND_FG = "hsl(210, 20%, 96%)";
export const BRAND_MUTED = MUTED;

export function BrandMark({
  size,
  background = BG,
  borderRadius = 0,
}: {
  size: number;
  background?: string;
  borderRadius?: number;
}) {
  const innerR = size * 0.34;
  const outerR = size * 0.46;
  const strokeW = Math.max(1, size * 0.06);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: size,
        height: size,
        background,
        borderRadius,
      }}
    >
      {Array.from({ length: TOTAL }, (_, i) => {
        const fired = FIRED.has(i);
        const angleDeg = (i / TOTAL) * 360;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              display: "flex",
              left: size / 2 - strokeW / 2,
              top: size / 2 - outerR,
              width: strokeW,
              height: outerR - innerR,
              background: fired ? PRIMARY : MUTED,
              opacity: fired ? 1 : 0.35,
              borderRadius: strokeW / 2,
              transformOrigin: `${strokeW / 2}px ${outerR}px`,
              transform: `rotate(${angleDeg}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}
