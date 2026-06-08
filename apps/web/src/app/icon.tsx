import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand-mark";

export const runtime = "edge";
// 48px is Google's minimum for the search-result favicon (it wants a multiple
// of 48px); browsers downscale to 16/32 for the tab. See robots.ts — the /icon
// route must stay crawlable for Google to pick this up.
export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<BrandMark size={48} borderRadius={11} />, size);
}
