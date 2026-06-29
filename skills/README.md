# pseolint skills — SEO skills with teeth

Most SEO/marketing skills are prose checklists: "make pages unique," "answer the
query." Good advice, no way to know if you followed it.

**These are different. Every guideline maps to a runnable [pseolint](https://pseolint.dev)
rule** — 40+ executable checks across spam, content, technical, AEO, links, and
schema. So a skill doesn't just tell you what to do; it ends in a pass/fail you
can run (`npx pseolint`), fix, and gate in CI.

## Install

```bash
# one skill
npx skills add ouranos-labs/pseolint --skill aeo

# or several
npx skills add ouranos-labs/pseolint --skill pseolint aeo
```

## Skills

| Skill | What it does | Backed by |
|-------|--------------|-----------|
| **`pseolint`** | Full-lifecycle programmatic SEO: design → build → audit → fix → gate. 12 playbooks, each annotated with the rules that gate it. | `spam/*`, `content/*`, `tech/*`, `links/*`, `schema/*` |
| **`aeo`** | Answer-engine optimization (AEO/GEO): get cited in AI Overviews, ChatGPT, Perplexity — not just ranked. | `aeo/*` (answer-first, citable-facts, llms-txt, …) |

*Roadmap (engine-backed, shipping as they earn their keep): `schema-markup`,
`technical-seo`, `internal-linking`, `spambrain-risk`.*

## Why engine-backed matters

The skills are the design-time, judgment half; the [pseolint engine](https://pseolint.dev)
(CLI, [MCP server](https://www.npmjs.com/package/@pseolint/mcp), [CI Action](https://github.com/ouranos-labs/pseolint))
is the measurement half. The skills work as guidance with zero install; they get
*teeth* when the engine is present. Same rules, open knowledge: browse them at
[pseolint.dev/okf](https://pseolint.dev/okf).

## License

MIT — see [LICENSE](../LICENSE).
