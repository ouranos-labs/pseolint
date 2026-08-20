import type { PageGroupConfig, ParsedPage } from "./types.js";

// Token kinds for the glob pattern tokenizer.
type Token =
  | { kind: "literal"; value: string }
  | { kind: "star" }
  | { kind: "globstar" };

// Splits a glob pattern into literal and wildcard tokens.
function tokenize(pattern: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let literal = "";
  while (i < pattern.length) {
    if (pattern[i] === "*") {
      if (literal.length > 0) {
        tokens.push({ kind: "literal", value: literal });
        literal = "";
      }
      if (pattern[i + 1] === "*") {
        tokens.push({ kind: "globstar" });
        i += 2;
      } else {
        tokens.push({ kind: "star" });
        i += 1;
      }
    } else {
      literal += pattern[i];
      i += 1;
    }
  }
  if (literal.length > 0) {
    tokens.push({ kind: "literal", value: literal });
  }
  return tokens;
}

// Linear glob matcher: no RegExp construction, immune to ReDoS.
// Supports * (any non-slash chars) and ** (any chars including slash).
// Anchored to the end of value; pattern may match at any slash-delimited
// segment boundary within the string.
function matchGlob(pattern: string, value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  const tokens = tokenize(pattern);

  const n = normalized.length;
  const m = tokens.length;

  // pos[j] = 1 means we can be at character index j in normalized.
  // Seed position 0 and every position that sits ON a slash so that
  // patterns starting with "/" (e.g. "/about") match at segment boundaries.
  let pos = new Uint8Array(n + 1);
  pos[0] = 1;
  for (let j = 0; j < n; j++) {
    if (normalized[j] === "/") pos[j] = 1;
  }

  for (let ti = 0; ti < m; ti++) {
    const tok = tokens[ti];
    const next = new Uint8Array(n + 1);

    if (tok.kind === "literal") {
      const lit = tok.value;
      const ll = lit.length;
      for (let j = 0; j <= n - ll; j++) {
        if (pos[j] && normalized.startsWith(lit, j)) {
          next[j + ll] = 1;
        }
      }
    } else if (tok.kind === "star") {
      // Consume zero or more non-slash characters.
      for (let j = 0; j <= n; j++) {
        if (!pos[j]) continue;
        next[j] = 1;
        for (let k = j + 1; k <= n; k++) {
          if (normalized[k - 1] === "/") break;
          next[k] = 1;
        }
      }
    } else {
      // globstar: consume zero or more characters including slashes.
      for (let j = 0; j <= n; j++) {
        if (!pos[j]) continue;
        for (let k = j; k <= n; k++) {
          next[k] = 1;
        }
      }
    }

    pos = next;
  }

  return pos[n] === 1;
}

function matchesGroup(url: string, config: PageGroupConfig): boolean {
  const patterns = Array.isArray(config.match) ? config.match : [config.match];
  return patterns.some((pattern) => matchGlob(pattern, url));
}

export function classifyPages(
  pages: ParsedPage[],
  groups: Record<string, PageGroupConfig> | undefined
): Map<string, ParsedPage[]> {
  const result = new Map<string, ParsedPage[]>();

  if (!groups || Object.keys(groups).length === 0) {
    result.set("__default", [...pages]);
    return result;
  }

  for (const groupName of Object.keys(groups)) {
    result.set(groupName, []);
  }
  result.set("__default", []);

  const groupEntries = Object.entries(groups);

  for (const page of pages) {
    let matched = false;
    for (const [name, config] of groupEntries) {
      if (matchesGroup(page.url, config)) {
        result.get(name)!.push(page);
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.get("__default")!.push(page);
    }
  }

  return result;
}

export function isRuleEnabled(ruleId: string, rules: string[] | undefined): boolean {
  if (rules === undefined) return true;
  if (rules.length === 0) return false;
  return rules.some((pattern) => {
    if (pattern === ruleId) return true;
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      return ruleId.startsWith(prefix + "/");
    }
    return false;
  });
}
