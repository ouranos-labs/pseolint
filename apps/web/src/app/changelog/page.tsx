import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { env } from "@/lib/env";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Changelog · pseolint",
  description:
    "Every published pseolint package and its release history — core engine, CLI, MCP server, GitHub Action, browser extension, and hosted app — read straight from the source at build time.",
  alternates: { canonical: `${SITE_URL}/changelog` },
};

// Read at build time from the workspace, so versions are ground truth and can
// never drift from what actually ships. Static page → the fs reads happen once
// at build and bake into HTML; nothing runs at request time.
// ponytail: no markdown lib — the changesets format is regular enough to parse
// in ~15 lines; add react-markdown only if we start rendering richer content.
export const dynamic = "force-static";

type Pkg = { dir: string; name: string; channel: string };

// repo-relative to apps/web (process.cwd() at build)
const PACKAGES: Pkg[] = [
  { dir: "../../packages/core", name: "@pseolint/core", channel: "npm · engine" },
  { dir: "../../packages/cli", name: "pseolint", channel: "npm · CLI" },
  { dir: "../../packages/mcp", name: "@pseolint/mcp", channel: "npm · MCP server" },
  { dir: "../../packages/action", name: "@pseolint/action", channel: "GitHub Action" },
  { dir: "../../apps/extension", name: "@pseolint/extension", channel: "Chrome Web Store" },
  { dir: ".", name: "@pseolint/web", channel: "hosted app" },
];

type Entry = { version: string; changes: string[] };

function read(rel: string): string | null {
  try {
    return readFileSync(join(process.cwd(), rel), "utf-8");
  } catch {
    return null;
  }
}

function parseChangelog(md: string): Entry[] {
  // sections split on "## " version headers (drop the leading "# title" chunk)
  return md
    .split(/^## /m)
    .slice(1)
    .map((sec) => {
      const nl = sec.indexOf("\n");
      const version = (nl === -1 ? sec : sec.slice(0, nl)).trim();
      const body = nl === -1 ? "" : sec.slice(nl + 1);
      const changes: string[] = [];
      for (const raw of body.split("\n")) {
        const bullet = raw.match(/^\s*-\s+(.*)/); // top- or sub-bullet (flattened)
        if (bullet) {
          const text = bullet[1].replace(/^[0-9a-f]{7,}:\s*/i, ""); // strip changeset commit hash
          if (text.trim()) changes.push(text.trim());
        } else if (raw.trim() && /^\s+/.test(raw) && changes.length) {
          changes[changes.length - 1] += " " + raw.trim(); // continuation of prior bullet
        }
      }
      return { version, changes };
    })
    .filter((e) => e.version);
}

// minimal inline markdown → JSX for `code`, **bold**, [text](url) (trusted source)
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<code key={k++} className="font-mono text-[0.85em] text-foreground">{m[1]}</code>);
    else if (m[2]) out.push(<strong key={k++} className="text-foreground">{m[2]}</strong>);
    else out.push(<a key={k++} href={m[4]} className="text-primary hover:underline">{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function load(): { name: string; channel: string; version: string; entries: Entry[] }[] {
  return PACKAGES.map((p) => {
    let version = "—";
    const pkgJson = read(join(p.dir, "package.json"));
    if (pkgJson) {
      try {
        version = (JSON.parse(pkgJson).version as string) ?? "—";
      } catch {
        /* keep — */
      }
    }
    const md = read(join(p.dir, "CHANGELOG.md"));
    return { name: p.name, channel: p.channel, version, entries: md ? parseChangelog(md) : [] };
  });
}

export default function ChangelogPage() {
  const packages = load();
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Changelog
      </div>
      <h1 className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl">Release history</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Every shipping pseolint package and its version, read straight from the workspace at build time — so
        what you see here is exactly what ships, never a hand-maintained copy that drifts.
      </p>

      {/* current-versions summary */}
      <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {packages.map((p) => (
          <div
            key={p.name}
            className="flex items-center justify-between rounded-[14px] border border-primary/20 bg-primary/5 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-sm text-foreground">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.channel}</div>
            </div>
            <span className="ml-3 shrink-0 rounded-full bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold text-primary">
              v{p.version}
            </span>
          </div>
        ))}
      </div>

      {/* per-package history */}
      {packages.map((p) => (
        <section key={p.name} className="mt-12">
          <h2 className="font-mono text-lg text-foreground">{p.name}</h2>
          {p.entries.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No changelog entries.</p>
          ) : (
            <ol className="mt-4 space-y-6">
              {p.entries.map((e) => (
                <li key={e.version} className="border-l-2 border-primary/20 pl-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold text-primary">v{e.version}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {e.changes.map((c, i) => (
                      <li key={i} className="text-sm leading-relaxed text-muted-foreground">
                        {inline(c)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </main>
  );
}
