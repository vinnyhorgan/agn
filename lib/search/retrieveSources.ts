import { lexicalSearch } from "@/lib/search/lexicalSearch";
import type { SourceChunk } from "@/lib/search/types";

const focusedChunkLimit = 8;
const focusedCharacterBudget = 9_000;
const overviewChunkLimit = 60;
const overviewCharacterBudget = 48_000;

const overviewPatterns = [
  /\b(?:explain|summari[sz]e|overview|walk me through|go through)\b.*\b(?:slides?|decks?|sources?|presentation)\b/i,
  /\b(?:slides?|decks?|sources?|presentation)\b.*\b(?:explain|summari[sz]e|overview)\b/i,
  /\b(?:spiega|riassumi|panoramica|illustra)\b.*\b(?:slide|presentazione|dispensa|fonte)\b/i,
  /\b(?:slide|presentazione|dispensa|fonte)\b.*\b(?:spiega|riassumi|panoramica|illustra)\b/i,
];

export function retrieveSourceChunks({
  chunks,
  query,
  previousSources = [],
}: {
  chunks: SourceChunk[];
  query: string;
  previousSources?: SourceChunk[];
}): SourceChunk[] {
  if (chunks.length === 0) {
    return [];
  }

  if (isOverviewQuery(query)) {
    return selectOverviewChunks(chunks);
  }

  const rankedChunks = lexicalSearch(chunks, query, Math.min(chunks.length, 80)).map(
    (result) => result.chunk,
  );
  const contextualChunks = rankedChunks.length < 3 ? previousSources : [];

  return selectSlideDiverseChunks(
    [...rankedChunks, ...contextualChunks],
    focusedChunkLimit,
    focusedCharacterBudget,
  );
}

export function isOverviewQuery(query: string): boolean {
  const normalized = query.normalize("NFKC").trim();
  return overviewPatterns.some((pattern) => pattern.test(normalized));
}

function selectOverviewChunks(chunks: SourceChunk[]): SourceChunk[] {
  const chunksBySlide = new Map<string, SourceChunk[]>();

  for (const chunk of chunks) {
    const slideKey = `${chunk.deckId}:${chunk.slideNumber}`;
    const slideChunks = chunksBySlide.get(slideKey) ?? [];
    slideChunks.push(chunk);
    chunksBySlide.set(slideKey, slideChunks);
  }

  const orderedSlides = Array.from(chunksBySlide.values()).sort((left, right) => {
    const leftChunk = left[0]!;
    const rightChunk = right[0]!;
    const sourceComparison = (leftChunk.sourceLabel ?? "").localeCompare(
      rightChunk.sourceLabel ?? "",
      undefined,
      { numeric: true },
    );

    return (
      sourceComparison ||
      leftChunk.sourceSlideNumber - rightChunk.sourceSlideNumber
    );
  });
  const firstPass = orderedSlides.map((slideChunks) => slideChunks[0]!);
  const remainingPasses = orderedSlides.flatMap((slideChunks) => slideChunks.slice(1));

  return takeWithinBudget(
    [...firstPass, ...remainingPasses],
    overviewChunkLimit,
    overviewCharacterBudget,
  );
}

function selectSlideDiverseChunks(
  chunks: SourceChunk[],
  limit: number,
  characterBudget: number,
): SourceChunk[] {
  const uniqueChunks = Array.from(new Map(chunks.map((chunk) => [chunk.id, chunk])).values());
  const seenSlides = new Set<string>();
  const firstPerSlide: SourceChunk[] = [];
  const additionalChunks: SourceChunk[] = [];

  for (const chunk of uniqueChunks) {
    const slideKey = `${chunk.deckId}:${chunk.slideNumber}`;

    if (seenSlides.has(slideKey)) {
      additionalChunks.push(chunk);
    } else {
      seenSlides.add(slideKey);
      firstPerSlide.push(chunk);
    }
  }

  return takeWithinBudget(
    [...firstPerSlide, ...additionalChunks],
    limit,
    characterBudget,
  );
}

function takeWithinBudget(
  chunks: SourceChunk[],
  limit: number,
  characterBudget: number,
): SourceChunk[] {
  const selected: SourceChunk[] = [];
  let characterCount = 0;

  for (const chunk of chunks) {
    if (selected.length >= limit) {
      break;
    }

    if (selected.length > 0 && characterCount + chunk.text.length > characterBudget) {
      continue;
    }

    selected.push(chunk);
    characterCount += chunk.text.length;
  }

  return selected;
}
