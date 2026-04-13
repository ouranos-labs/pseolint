function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function termFrequency(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const total = tokens.length;
  const tf = new Map<string, number>();
  for (const [term, count] of counts) {
    tf.set(term, count / total);
  }
  return tf;
}

export interface TfIdfCorpus {
  docSets: Set<string>[];
  docCount: number;
}

export function buildCorpus(allTexts: string[]): TfIdfCorpus {
  return {
    docSets: allTexts.map((t) => new Set(tokenize(t))),
    docCount: allTexts.length
  };
}

function inverseDocumentFrequency(term: string, corpus: TfIdfCorpus): number {
  let docsWithTerm = 0;
  for (const docSet of corpus.docSets) {
    if (docSet.has(term)) {
      docsWithTerm += 1;
    }
  }
  if (docsWithTerm === 0) {
    return 0;
  }
  return Math.log(corpus.docCount / docsWithTerm);
}

export function extractKeywords(text: string, allTexts: string[], topN: number): string[];
export function extractKeywords(text: string, corpus: TfIdfCorpus, topN: number): string[];
export function extractKeywords(text: string, source: string[] | TfIdfCorpus, topN: number): string[] {
  const corpus = Array.isArray(source) ? buildCorpus(source) : source;
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return [];
  }

  const tf = termFrequency(tokens);
  const scores = new Map<string, number>();

  for (const term of tf.keys()) {
    const idf = inverseDocumentFrequency(term, corpus);
    scores.set(term, (tf.get(term) ?? 0) * idf);
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term]) => term);
}
