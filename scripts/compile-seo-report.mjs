import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = path.join(__dirname, '..', 'serp-analysis-results.json');

try {
  const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const allQueries = data.queries || [];

  const domainCounts = {};
  const querySummary = [];
  let totalRedditQuora = 0;
  let totalAppleSpotify = 0;

  for (const q of allQueries) {
    const results = q.landscape?.summary?.results || [];
    const aioCitations = q.landscape?.summary?.aioCitations || [];
    
    let redditQuoraCount = 0;
    let appleSpotifyCount = 0;
    
    for (const r of results) {
      if (!r.url) continue;
      try {
        const domain = new URL(r.url).hostname.replace('www.', '');
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        
        if (domain.includes('reddit.com') || domain.includes('quora.com')) {
          redditQuoraCount++;
          totalRedditQuora++;
        }
        if (domain.includes('apple.com') || domain.includes('spotify.com')) {
          appleSpotifyCount++;
          totalAppleSpotify++;
        }
      } catch {}
    }

    querySummary.push({
      query: q.query,
      label: q.label,
      resultsCount: results.length,
      aioCount: aioCitations.length,
      redditQuoraCount,
      appleSpotifyCount
    });
  }

  // Sort domains
  const sortedDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Compile Markdown report
  let md = `# 📊 Advanced SERP Competitor Depth Report

This report was programmatically compiled from the rich, 14-query organic SERP landscape captured at ${new Date().toISOString()}.

---

## 🏆 Top Competitor Domains (Visibility Index)
*Number of times this domain ranked in the top 20 across all 14 target queries.*

| Competitor Domain | Query Appearances | Profile Type |
| :--- | :---: | :--- |
${sortedDomains.map(([domain, count]) => {
  let type = "Independent Blog / Article";
  if (domain.includes('apple.com') || domain.includes('spotify.com')) type = "Primary Playback Directory";
  if (domain.includes('reddit.com')) type = "Community Forum (E-E-A-T Target)";
  if (domain.includes('podcastreview.org') || domain.includes('podchaser.com') || domain.includes('listennotes.com')) type = "Podcast Discovery / Database";
  return `| \`${domain}\` | **${count}** | ${type} |`;
}).join('\n')}

---

## 📈 Search Query Landscape Details
*Breakdown of organic results, SGE citations, and platform indicators for each audited term.*

| Target Query | Label | Organic Results | SGE Citations | Forum Density | Playback Feeds |
| :--- | :--- | :---: | :---: | :---: | :---: |
${querySummary.map(q => {
  return `| "${q.query}" | \`${q.label}\` | ${q.resultsCount} | ${q.aioCount} | ${q.redditQuoraCount > 0 ? `🔥 ${q.redditQuoraCount}` : '0'} | ${q.appleSpotifyCount > 0 ? `🎧 ${q.appleSpotifyCount}` : '0'} |`;
}).join('\n')}

---

## 💡 Key Actionable Insights

### 1. The Reddit E-E-A-T Opportunity
Community discussion pages (e.g. \`reddit.com\`) appeared **${totalRedditQuora} times** across our target keywords. Google ranks these because they contain actual people sharing personal favorites. 
* **Action**: Since Reddit threads are unformatted and quickly get outdated, you should optimize Podcurator's \`/best/[slug]\` pages to offer similar human curation notes (with a *"Curator Notes"* section or *"User Rating Reviews"* schema) to give Google a structured, clean alternative to index.

### 2. Primary Playback Monopolies
Apple Podcasts and Spotify directories (\`apple.com\` and \`spotify.com\`) appeared **${totalAppleSpotify} times**. They are highly authoritative but offer poor search capabilities for long-tail topics.
* **Action**: Keep building comparing/landing pages like \`/compare/spotify\` and \`/compare/apple-podcasts\` to redirect users seeking better, topic-specific discovery tools.
`;

  fs.writeFileSync(path.join(__dirname, '..', 'serp_opportunity_report.md'), md);
  console.log("Deep Report compiled successfully!");

} catch (err) {
  console.error("Failed to compile report:", err.stack);
}
