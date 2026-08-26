import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * The domain workspace is a layout with sibling tab routes (overview, traffic,
 * monitoring, settings). A mutation that revalidates the EXACT path
 * `/dashboard/${host}` therefore refreshes overview only, leaving the other
 * tabs serving pre-mutation data: pause a domain from settings and monitoring
 * still shows it live. The failure is silent, which is what makes it worth a
 * test rather than a code comment.
 *
 * Static analysis on the source, not behaviour: it costs nothing, needs no DB,
 * and catches the mistake at the moment someone writes the next action.
 */

const DASHBOARD_DIR = path.resolve(__dirname, "../../src/app/dashboard");
const APP_DIR = path.resolve(__dirname, "../../src/app");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

interface Call {
  file: string;
  pathArg: string;
  scope: string | null;
}

const CALL_RE =
  /revalidatePath\(\s*(`[^`]*`|"[^"]*"|'[^']*')\s*(?:,\s*(?:"([^"]*)"|'([^']*)'))?\s*\)/g;

function revalidateCalls(): Call[] {
  const calls: Call[] = [];
  for (const file of sourceFiles(DASHBOARD_DIR)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(CALL_RE)) {
      calls.push({
        file: path.relative(DASHBOARD_DIR, file),
        pathArg: m[1].slice(1, -1), // strip the quote/backtick
        scope: m[2] ?? m[3] ?? null,
      });
    }
  }
  return calls;
}

describe("dashboard revalidatePath calls", () => {
  const calls = revalidateCalls();

  it("finds the calls at all (guards against the regex silently matching nothing)", () => {
    expect(calls.length).toBeGreaterThan(10);
  });

  it("revalidates the whole workspace layout, never just one tab", () => {
    // A path interpolating a host directly under /dashboard/ addresses a domain
    // workspace, which spans several routes under one layout.
    const hostScoped = calls.filter((c) => c.pathArg.startsWith("/dashboard/${"));
    expect(hostScoped.length).toBeGreaterThan(0);

    const exactPathOnly = hostScoped.filter((c) => c.scope !== "layout");
    expect(
      exactPathOnly.map((c) => `${c.file}: revalidatePath(\`${c.pathArg}\`)`),
    ).toEqual([]);
  });

  it("points every static dashboard path at a route that exists", () => {
    // Catches a typo'd literal (/dashboard/setting) that would revalidate
    // nothing at all and fail completely silently.
    const staticDashboard = calls.filter(
      (c) => c.pathArg.startsWith("/dashboard") && !c.pathArg.includes("${"),
    );
    const missing = staticDashboard.filter((c) => {
      const dir = path.join(APP_DIR, c.pathArg.replace(/^\//, ""));
      return !existsSync(path.join(dir, "page.tsx"));
    });
    expect(missing.map((c) => `${c.file}: ${c.pathArg}`)).toEqual([]);
  });
});
