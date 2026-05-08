// Metadata is owned by pricing/page.tsx (page-level wins in Next.js).
// The layout-level export was removed in v0.6.4 to eliminate the maintenance trap.
export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
