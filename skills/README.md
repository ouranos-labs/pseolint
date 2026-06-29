# pseolint skills — SEO & AEO skills with teeth

[![npm](https://img.shields.io/npm/v/pseolint?color=cb3837&logo=npm)](https://www.npmjs.com/package/pseolint)
[![GitHub stars](https://img.shields.io/github/stars/ouranos-labs/pseolint?style=social)](https://github.com/ouranos-labs/pseolint)
[![License](https://img.shields.io/npm/l/pseolint?color=blue)](../LICENSE)
[![pseolint.dev dogfood](https://pseolint.dev/api/badge/pseolint.dev)](https://pseolint.dev/leaderboard)

Claude/agent **skills** for programmatic SEO and answer-engine optimization
(AEO / GEO) — the disciplines of ranking template pages at scale *and* getting
cited in AI answers (Google AI Overviews, ChatGPT, Perplexity, Claude).

Most SEO skills are prose checklists: *"make pages unique," "answer the query."*
Good advice, no way to know if you followed it. **These are different — every
guideline maps to a runnable [pseolint](https://pseolint.dev) rule** (40+
executable checks across spam, content, technical, AEO, links, and schema). A
skill doesn't just tell you what to do; it ends in a pass/fail you can run
(`npx pseolint`), fix, and gate in CI.

## Install

```bash
# one skill
npx skills add ouranos-labs/pseolint --skill aeo

# the suite
npx skills add ouranos-labs/pseolint --skill pseolint aeo
```

## Skills

| Skill | What it does | Backed by |
|-------|--------------|-----------|
| **[`pseolint`](pseolint/SKILL.md)** | Full-lifecycle **programmatic SEO**: design → build → audit → fix → gate. 12 playbooks, each annotated with the rules that gate it. | `spam/*` `content/*` `tech/*` `links/*` `schema/*` |
| **[`aeo`](aeo/SKILL.md)** | **Answer-engine optimization (AEO / GEO)**: get cited in AI Overviews, ChatGPT, Perplexity — not just ranked in blue links. | `aeo/*` (answer-first, citable-facts, llms.txt, …) |

*Roadmap (engine-backed, shipping as they earn their keep): `schema-markup`,
`technical-seo`, `internal-linking`, `spambrain-risk`.*

## Why "with teeth" matters

By 2026 discovery is splitting between classic ranking and **being the source an
AI answer cites** — zero-click results and AI Overviews now dominate high-intent
queries, and E-E-A-T has become the trust filter AI systems use to pick sources.
Generic advice can't tell you whether a page clears that bar. These skills can,
because the design-time guidance is wired to a real engine:

- **Skills** = the judgment half (design, strategy) — useful with zero install.
- **[pseolint engine](https://pseolint.dev)** = the measurement half — CLI
  (`npx pseolint`), [MCP server](https://www.npmjs.com/package/@pseolint/mcp),
  and [CI Action](https://github.com/ouranos-labs/pseolint) — turns the checklist
  into a verdict.

Same rules, open knowledge: browse every check at
[pseolint.dev/okf](https://pseolint.dev/okf).

## Also available as a Claude Code plugin marketplace

```
/plugin marketplace add ouranos-labs/pseolint
```

Defined in [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json).

## License

MIT — see [LICENSE](../LICENSE). Part of [pseolint](https://github.com/ouranos-labs/pseolint).
