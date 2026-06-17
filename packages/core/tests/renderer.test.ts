import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { renderPages } from "../src/renderer.js";

// JS injects a form via DOM API — raw bytes contain zero <input>/<button>.
const SHELL = `<!doctype html><html><head><title>s</title></head><body>
<div id="app"></div>
<script>
  var f=document.createElement('form');
  f.appendChild(document.createElement('input'));
  var b=document.createElement('button'); b.textContent='Go'; f.appendChild(b);
  document.getElementById('app').appendChild(f);
</script></body></html>`;

function hasBrowser(): boolean {
  try { createRequire(import.meta.url)("playwright-core"); } catch { return false; }
  return true;
}

describe("renderPages (Node only — JS executes, post-render DOM returned)", () => {
  it.skipIf(!hasBrowser())("renders injected DOM not present in raw HTML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-render-"));
    try {
      await writeFile(join(dir, "shell.html"), SHELL, "utf8");
      const out = await renderPages(
        [{ url: "http://local/shell.html", localPath: "shell.html" }],
        dir,
        { concurrency: 1, timeoutMs: 20000, analyticsMode: "allow" },
      );
      const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, "");
      const rendered = strip(out[0]?.html ?? "");
      expect((rendered.match(/<input/gi) ?? []).length).toBeGreaterThanOrEqual(1);
      expect((rendered.match(/<button/gi) ?? []).length).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 40000);
});
