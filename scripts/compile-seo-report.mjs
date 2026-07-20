import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = path.join(__dirname, '..', 'serp-analysis-results.json');
const reportPath = path.join(__dirname, '..', 'pseolint-serp-report.md');

// ponytail: generic, niche-agnostic domain buckets — no per-competitor hardcoding.
// Interpretation of who to attack comes from reading the data, not baked-in guesses.
const FORUMS = ['reddit.com', 'quora.com', 'stackoverflow.com', 'stackexchange.com'];
const SEO_PLATFORMS = ['ahrefs.com', 'semrush.com', 'moz.com', 'screamingfrog.co.uk', 'sitebulb.com', 'backlinko.com', 'searchenginejournal.com', 'searchengineland.com', 'searchenginewatch.com', 'seroundtable.com', 'conductor.com'];
const OFFICIAL_DOCS = ['developers.google.com', 'support.google.com', 'learn.microsoft.com', 'developers.microsoft.com'];

function classify(domain) {
  if (FORUMS.some(d => domain.includes(d))) return ['Community forum', 'High authority, unstructured/aging answers — beatable with a structured tool page.'];
  if (SEO_PLATFORMS.some(d => domain.includes(d))) return ['SEO platform / publication', 'Established authority — target comparison and long-tail symptom terms, not head terms.'];
  if (OFFICIAL_DOCS.some(d => domain.includes(d))) return ['Official docs', 'Reference source Google keeps for authority; weak on actionable tooling.'];
  return ['Independent / other', 'Analyze for content gaps or target directly.'];
}

try {
  const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const allQueries = data.queries || [];

  const domainCounts = {};
  const sgeCitations = {};
  const templatePatterns = [];
  const querySummary = [];

  let totalSgeCitationsCount = 0;

  for (const q of allQueries) {
    const results = q.landscape?.summary?.results || [];
    const aioCitations = q.landscape?.summary?.aioCitations || [];
    const clusters = q.landscape?.summary?.clusters || [];

    let forumCount = 0;
    let platformCount = 0;

    for (const c of clusters) {
      templatePatterns.push({ query: q.query, host: c.host, pattern: c.pattern, count: c.count });
    }

    for (const citation of aioCitations) {
      totalSgeCitationsCount++;
      try {
        const domain = new URL(citation).hostname.replace('www.', '');
        sgeCitations[domain] = (sgeCitations[domain] || 0) + 1;
      } catch {}
    }

    for (const r of results) {
      if (!r.url) continue;
      try {
        const domain = new URL(r.url).hostname.replace('www.', '');
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        if (FORUMS.some(d => domain.includes(d))) forumCount++;
        if (SEO_PLATFORMS.some(d => domain.includes(d))) platformCount++;
      } catch {}
    }

    querySummary.push({
      query: q.query,
      label: q.label,
      total: results.length,
      aioCount: aioCitations.length,
      forumCount,
      platformCount,
    });
  }

  const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const sortedSge = Object.entries(sgeCitations).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const sortedTemplates = templatePatterns.sort((a, b) => b.count - a.count).slice(0, 15);

  const md = `# 📊 SERP Competitor Depth Report (pseolint.dev)

Programmatically compiled from ${allQueries.length} organic SERP captures at **${new Date().toLocaleString()}**.

Informs pSEO sitemap hierarchy, page layouts, and AI Overview (SGE) strategy for **pseolint.dev**.

---

## 🏆 Top Competitor Domains (Visibility Index)
*Times this domain ranked in the top 20 across all queries.*

| Competitor Domain | Query Appearances | Profile Type | Note |
| :--- | :---: | :--- | :--- |
${sortedDomains.map(([domain, count]) => {
  const [type, note] = classify(domain);
  return `| \`${domain}\` | **${count}** | ${type} | ${note} |`;
}).join('\n')}

---

## 🤖 AI Overview (SGE) Citation Leaders
*Domains cited inside Google's AI Overview boxes across the queries.*

| Cited Domain | Citations | Share |
| :--- | :---: | :---: |
${sortedSge.map(([domain, count]) => {
  const share = totalSgeCitationsCount > 0 ? Math.round((count / totalSgeCitationsCount) * 100) : 0;
  return `| \`${domain}\` | **${count}** | ${share}% |`;
}).join('\n')}

---

## 🧩 Programmatic Template Clusters Detected
*Evidence of competitor sitemap architectures (templated directory structures at scale).*

| Competitor Host | Detected Pattern | Sibling Count | Query Source |
| :--- | :--- | :---: | :--- |
${sortedTemplates.map(t => `| \`${t.host}\` | \`${t.pattern}\` | **${t.count}** | "${t.query}" |`).join('\n')}

---

## 📈 Search Query Landscape
*Per-query metrics across all targets.*

| Target Query | Intent | Organic | SGE Cites | Forum Density | SEO-Platform Density |
| :--- | :--- | :---: | :---: | :---: | :---: |
${querySummary.map(q => {
  const f = q.forumCount > 0 ? `🔥 ${q.forumCount}` : '0';
  const p = q.platformCount > 0 ? `📊 ${q.platformCount}` : '0';
  return `| "${q.query}" | \`${q.label}\` | ${q.total} | ${q.aioCount} | ${f} | ${p} |`;
}).join('\n')}
`;

  fs.writeFileSync(reportPath, md);
  console.log(`Report compiled → ${reportPath}`);

} catch (err) {
  console.error("Failed to compile report:", err.stack);
}
