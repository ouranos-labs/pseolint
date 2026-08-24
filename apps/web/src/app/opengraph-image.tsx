import { ImageResponse } from "next/og";
import { BrandMark, BRAND_BG, BRAND_FG, BRAND_MUTED, BRAND_PRIMARY } from "@/lib/brand-mark";

export const runtime = "edge";
export const alt = "pseolint: SpamBrain-proof your pSEO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 80,
          padding: 96,
          background: `radial-gradient(ellipse at 22% 50%, hsl(158, 64%, 12%) 0%, ${BRAND_BG} 65%)`,
        }}
      >
        <div style={{ display: "flex" }}>
          <BrandMark size={320} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: 132,
              fontWeight: 700,
              color: BRAND_FG,
              letterSpacing: "-0.045em",
              lineHeight: 1,
            }}
          >
            pseolint
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 42,
              color: BRAND_MUTED,
              lineHeight: 1.2,
              maxWidth: 640,
            }}
          >
            SpamBrain-proof your pSEO.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 24,
              color: BRAND_PRIMARY,
              letterSpacing: "0.04em",
            }}
          >
            site-type-aware audit · 60-second · OSS-first
          </div>
        </div>
      </div>
    ),
    size,
  );
}
