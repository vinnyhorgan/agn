import type { SearchResult, SourceChunk } from "@/lib/search/types";

const maxResults = 10;
const snippetRadius = 90;

export function lexicalSearch(
  chunks: SourceChunk[],
  query: string,
  limit = maxResults,
): SearchResult[] {
  const terms = uniqueTokens(tokenize(query));

  if (terms.length === 0) {
    return [];
  }

  return chunks
    .map((chunk) => scoreChunk(chunk, terms))
    .filter((result): result is SearchResult => result !== undefined)
    .sort(compareResults)
    .slice(0, limit);
}

function scoreChunk(
  chunk: SourceChunk,
  terms: string[],
): SearchResult | undefined {
  const textTokens = tokenize(chunk.text);
  const titleTokens = tokenize(chunk.slideTitle ?? "");
  const headingTokens = tokenize(chunk.headingPath?.join(" ") ?? "");
  const matchedTerms: string[] = [];
  let score = 0;

  for (const term of terms) {
    const bodyMatches = countTokenMatches(textTokens, term);
    const titleMatches = countTokenMatches(titleTokens, term);
    const headingMatches = countTokenMatches(headingTokens, term);
    const totalMatches = bodyMatches + titleMatches + headingMatches;

    if (totalMatches === 0) {
      continue;
    }

    matchedTerms.push(term);
    score += 6;
    score += Math.min(bodyMatches, 5);
    score += titleMatches * 3;
    score += headingMatches * 2;
  }

  if (matchedTerms.length === 0) {
    return undefined;
  }

  score += matchedTerms.length * 8;
  score += (matchedTerms.length / terms.length) * 12;

  return {
    chunk,
    score,
    matchedTerms,
    snippet: createSnippet(chunk.text, matchedTerms),
  };
}

function compareResults(left: SearchResult, right: SearchResult): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.chunk.slideNumber !== right.chunk.slideNumber) {
    return left.chunk.slideNumber - right.chunk.slideNumber;
  }

  return left.chunk.id.localeCompare(right.chunk.id);
}

function createSnippet(text: string, terms: string[]): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= snippetRadius * 2) {
    return normalized;
  }

  const lowerText = normalized.toLowerCase();
  const firstMatchIndex = terms.reduce<number | undefined>((best, term) => {
    const index = lowerText.indexOf(term.toLowerCase());

    if (index === -1) {
      return best;
    }

    return best === undefined ? index : Math.min(best, index);
  }, undefined);
  const center = firstMatchIndex ?? 0;
  const start = Math.max(0, center - snippetRadius);
  const end = Math.min(normalized.length, center + snippetRadius);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < normalized.length ? " ..." : "";

  return `${prefix}${normalized.slice(start, end).trim()}${suffix}`;
}

function countTokenMatches(tokens: string[], term: string): number {
  return tokens.reduce((count, token) => {
    if (token === term) {
      return count + 1;
    }

    if (term.length >= 4 && token.startsWith(term)) {
      return count + 1;
    }

    return count;
  }, 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens));
}
