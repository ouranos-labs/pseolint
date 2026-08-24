import { access, appendFile, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const GITIGNORE_BLOCK = `
# pseolint runtime (cache, state, telemetry: can reach 1 GB+ on large pSEO sites)
.pseolint/
`;

/** Patterns that already effectively ignore `.pseolint/`. Matched line-by-line, trimmed. */
const ALREADY_IGNORED_PATTERNS = [
  ".pseolint",
  ".pseolint/",
  "/.pseolint",
  "/.pseolint/",
  ".pseolint/*",
  "**/.pseolint",
  "**/.pseolint/",
];

/** Walk up from `start` looking for a `.git` entry. Returns the containing dir, or null. */
async function findRepoRoot(start: string): Promise<string | null> {
  let dir = start;
  // Cap depth to avoid walking the whole drive on orphaned paths.
  for (let i = 0; i < 40; i += 1) {
    try {
      const s = await stat(join(dir, ".git"));
      if (s.isDirectory() || s.isFile()) return dir;
    } catch {
      // .git not here; keep walking up.
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function alreadyIgnored(contents: string): boolean {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (ALREADY_IGNORED_PATTERNS.includes(trimmed)) return true;
  }
  return false;
}

export interface EnsureGitignoreResult {
  /** Absolute path to the .gitignore that was checked/modified. Null if no repo found. */
  gitignorePath: string | null;
  /** True when we appended .pseolint/. False when already ignored, not a repo, or skipped. */
  modified: boolean;
  /** Short human-readable reason, for verbose logging. */
  reason: "appended" | "already-ignored" | "no-repo" | "no-gitignore-file" | "error";
}

/**
 * Ensure the nearest git repo's root `.gitignore` excludes `.pseolint/`. No-op
 * if CWD isn't inside a git repo, or the file already ignores the folder.
 *
 * Never creates `.gitignore` from scratch: only appends when the file already
 * exists. (A repo with no `.gitignore` is often intentional; we don't want to
 * surprise users with a new tracked file.)
 */
export async function ensurePseolintGitignored(cwd: string): Promise<EnsureGitignoreResult> {
  const root = await findRepoRoot(cwd);
  if (!root) return { gitignorePath: null, modified: false, reason: "no-repo" };

  const gitignorePath = join(root, ".gitignore");
  let existing: string;
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch {
    // No .gitignore at repo root; don't create one silently.
    try {
      await access(gitignorePath);
      return { gitignorePath, modified: false, reason: "error" };
    } catch {
      return { gitignorePath, modified: false, reason: "no-gitignore-file" };
    }
  }

  if (alreadyIgnored(existing)) {
    return { gitignorePath, modified: false, reason: "already-ignored" };
  }

  try {
    const sep = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
    await appendFile(gitignorePath, `${sep}${GITIGNORE_BLOCK}`, "utf8");
    return { gitignorePath, modified: true, reason: "appended" };
  } catch {
    return { gitignorePath, modified: false, reason: "error" };
  }
}
