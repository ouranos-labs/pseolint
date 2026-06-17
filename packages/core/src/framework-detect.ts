import { load } from "cheerio";

export type ClientFramework = "nextjs" | "react" | "vite" | "astro";

const NEXT = [/self\.__next_f/, /\/_next\/static\//, /id="__next"/];
const VITE = [/\/@vite\//, /<script[^>]+type="module"[^>]+src="\//i];
const ASTRO = [/astro-island/, /\/_astro\//];

/** Detect a client-side framework from raw HTML body markers (not headers). */
export function detectClientFrameworkFromHtml(html: string): ClientFramework | null {
  if (NEXT.some((re) => re.test(html))) return "nextjs";
  if (VITE.some((re) => re.test(html))) return "vite";
  if (ASTRO.some((re) => re.test(html))) return "astro";
  if (/id="root"/.test(html) && /<script[^>]+src=/i.test(html)) return "react";
  return null;
}

const INTERACTIVE = "input, select, textarea, button, form";

/** Count interactive form controls present in HTML. Used symmetrically on raw + rendered. */
export function countInteractive(html: string): number {
  return load(html)(INTERACTIVE).length;
}
