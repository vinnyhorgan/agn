import MiniSearch, {
  type SearchResult as MiniSearchResult,
} from "minisearch";

import type { SearchResult, SourceChunk } from "@/lib/search/types";

const maxResults = 10;
const snippetRadius = 90;
const searchIndexCache = new WeakMap<SourceChunk[], SearchIndex>();

interface IndexedChunk {
  id: string;
  slideTitle: string;
  heading: string;
  text: string;
}

interface SearchIndex {
  engine: MiniSearch<IndexedChunk>;
  chunksById: Map<string, SourceChunk>;
}

export function lexicalSearch(
  chunks: SourceChunk[],
  query: string,
  limit = maxResults,
): SearchResult[] {
  if (!query.trim() || chunks.length === 0 || limit <= 0) {
    return [];
  }

  const { engine, chunksById } = getSearchIndex(chunks);

  return engine
    .search(query, {
      boost: { slideTitle: 4, heading: 2.5, text: 1 },
      combineWith: "OR",
      prefix: (term) => term.length >= 3,
      fuzzy: (term) => (term.length >= 6 ? 0.15 : false),
    })
    .map((result) => toSearchResult(result, chunksById))
    .filter((result): result is SearchResult => result !== undefined)
    .sort(compareResults)
    .slice(0, limit);
}

function getSearchIndex(chunks: SourceChunk[]): SearchIndex {
  const cached = searchIndexCache.get(chunks);

  if (cached) {
    return cached;
  }

  const engine = new MiniSearch<IndexedChunk>({
    idField: "id",
    fields: ["slideTitle", "heading", "text"],
    tokenize,
    processTerm: (term) => term.normalize("NFKC").toLocaleLowerCase(),
  });
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  engine.addAll(
    chunks.map((chunk) => ({
      id: chunk.id,
      slideTitle: chunk.slideTitle ?? "",
      heading: chunk.headingPath?.join(" ") ?? "",
      text: chunk.text,
    })),
  );

  const index = { engine, chunksById };
  searchIndexCache.set(chunks, index);

  return index;
}

function toSearchResult(
  result: MiniSearchResult,
  chunksById: Map<string, SourceChunk>,
): SearchResult | undefined {
  const chunk = chunksById.get(String(result.id));

  if (!chunk) {
    return undefined;
  }

  const matchedTerms = Object.keys(result.match);

  return {
    chunk,
    score: result.score,
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

  const lowerText = normalized.toLocaleLowerCase();
  const firstMatchIndex = terms.reduce<number | undefined>((best, term) => {
    const index = lowerText.indexOf(term.toLocaleLowerCase());

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

function tokenize(text: string): string[] {
  return text.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
}
