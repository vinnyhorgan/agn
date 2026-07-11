import { lexicalSearch } from "@/lib/search/lexicalSearch";
import type { SearchResult, SourceChunk } from "@/lib/search/types";

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

const conversationalPatterns = [
  /^(?:hey|hi|hello|ciao|salve|buongiorno|buonasera)[!?.\s]*$/i,
  /\b(?:who are you|what are you|chi sei)\b/i,
  /\b(?:what can you do|cosa (?:puoi|sai) fare)\b/i,
  /\b(?:which|what) (?:llm |language )?model (?:are you|you are|do you use)\b/i,
  /\b(?:system prompt|prompt di sistema)\b/i,
];

const catalogPatterns = [
  /\b(?:which|what|list|show|see|uploaded|available|all|how many)\b.*\b(?:sources?|resources?|decks?|files?|library)\b/i,
  /\b(?:sources?|resources?|decks?|files?|library)\b.*\b(?:which|what|list|show|see|uploaded|available|all|how many)\b/i,
  /\b(?:quali|elenca|mostra|vedi|caricat[ei]|tutt[ei]|quante?)\b.*\b(?:fonti|risorse|dispense|file|libreria)\b/i,
  /\b(?:fonti|risorse|dispense|file|libreria)\b.*\b(?:quali|elenca|mostra|vedi|caricat[ei]|tutt[ei]|quante?)\b/i,
];

export type RetrievalMode = "none" | "catalog" | "overview" | "focused";

export interface SourceRetrievalResult {
  mode: RetrievalMode;
  chunks: SourceChunk[];
  candidates: SearchResult[];
  previousSourcesUsed: boolean;
  expansions: Array<{ chunkId: string; reason: string }>;
}

export function retrieveSourceChunks({
  chunks,
  query,
  previousSources = [],
}: {
  chunks: SourceChunk[];
  query: string;
  previousSources?: SourceChunk[];
}): SourceChunk[] {
  return retrieveSourceChunksWithDiagnostics({
    chunks,
    query,
    previousSources,
  }).chunks;
}

export function retrieveSourceChunksWithDiagnostics({
  chunks,
  query,
  previousSources = [],
}: {
  chunks: SourceChunk[];
  query: string;
  previousSources?: SourceChunk[];
}): SourceRetrievalResult {
  const mode = getRetrievalMode(query);

  if (chunks.length === 0) {
    return { mode, chunks: [], candidates: [], previousSourcesUsed: false, expansions: [] };
  }

  if (mode === "none" || mode === "catalog") {
    return { mode, chunks: [], candidates: [], previousSourcesUsed: false, expansions: [] };
  }

  if (mode === "overview") {
    return {
      mode,
      chunks: selectOverviewChunks(chunks),
      candidates: [],
      previousSourcesUsed: false,
      expansions: [],
    };
  }

  const exactReferenceChunks = resolveExactSlideReference(chunks, query);
  if (exactReferenceChunks.length > 0) {
    return {
      mode,
      chunks: exactReferenceChunks,
      candidates: [],
      previousSourcesUsed: false,
      expansions: exactReferenceChunks.map((chunk) => ({
        chunkId: chunk.id,
        reason: "explicit source and slide reference",
      })),
    };
  }

  const rawCandidates = lexicalSearch(chunks, query, Math.min(chunks.length, 80));
  const candidates = applyRelevanceFloor(rawCandidates);
  const rankedChunks = candidates.map((result) => result.chunk);
  const contextualChunks = rankedChunks.length < 3 ? previousSources : [];
  const focusedChunks = selectSlideDiverseChunks(
    [...rankedChunks, ...contextualChunks],
    focusedChunkLimit,
    focusedCharacterBudget,
  );
  const expanded = expandAdjacentSlides(chunks, focusedChunks, query);
  const selectedChunks = selectSlideDiverseChunks(
    [...focusedChunks, ...expanded.map((item) => item.chunk)],
    focusedChunkLimit,
    focusedCharacterBudget,
  );

  return {
    mode,
    chunks: selectedChunks,
    candidates,
    previousSourcesUsed: contextualChunks.some((chunk) =>
      selectedChunks.some((selected) => selected.id === chunk.id),
    ),
    expansions: expanded
      .filter((item) => selectedChunks.some((chunk) => chunk.id === item.chunk.id))
      .map((item) => ({ chunkId: item.chunk.id, reason: item.reason })),
  };
}

function applyRelevanceFloor(results: SearchResult[]): SearchResult[] {
  const topScore = results[0]?.score;
  if (topScore === undefined) {
    return [];
  }

  const floor = topScore * 0.12;
  return results.filter((result) => result.score >= floor);
}

function resolveExactSlideReference(chunks: SourceChunk[], query: string): SourceChunk[] {
  const normalized = query.normalize("NFKC");
  const sourceThenSlide = normalized.match(
    /\b(?:source|fonte)\s*(\d+)\b[^\d]{0,40}\bslide\s*(\d+)\b/i,
  );
  const slideThenSource = normalized.match(
    /\bslide\s*(\d+)\b[^\d]{0,40}\b(?:source|fonte)\s*(\d+)\b/i,
  );
  const sourceNumber = Number(sourceThenSlide?.[1] ?? slideThenSource?.[2]);
  const slideNumber = Number(sourceThenSlide?.[2] ?? slideThenSource?.[1]);

  if (!Number.isInteger(sourceNumber) || !Number.isInteger(slideNumber)) {
    return [];
  }

  return chunks.filter(
    (chunk) =>
      chunk.sourceLabel === `Source ${sourceNumber}` &&
      chunk.sourceSlideNumber === slideNumber,
  );
}

function expandAdjacentSlides(
  allChunks: SourceChunk[],
  selected: SourceChunk[],
  query: string,
): Array<{ chunk: SourceChunk; reason: string }> {
  const walkthroughRequested =
    /\b(?:walkthrough|walk me through|step by step|derive|derivation|spiega passo passo)\b/i.test(
      query,
    );
  const selectedIds = new Set(selected.map((chunk) => chunk.id));
  const expansions = new Map<string, { chunk: SourceChunk; reason: string }>();

  for (const anchor of selected.slice(0, 3)) {
    for (const direction of [-1, 1] as const) {
      const adjacent = allChunks.find(
        (chunk) =>
          chunk.deckId === anchor.deckId &&
          chunk.slideNumber === anchor.slideNumber + direction,
      );
      if (!adjacent || selectedIds.has(adjacent.id)) {
        continue;
      }

      const sharedTitle =
        normalizeContinuationTitle(anchor.slideTitle) !== "" &&
        normalizeContinuationTitle(anchor.slideTitle) ===
          normalizeContinuationTitle(adjacent.slideTitle);
      const continuation =
        hasContinuationMarker(anchor.slideTitle) ||
        hasContinuationMarker(adjacent.slideTitle);
      if (!walkthroughRequested && !sharedTitle && !continuation) {
        continue;
      }

      expansions.set(adjacent.id, {
        chunk: adjacent,
        reason: walkthroughRequested
          ? `adjacent slide for requested walkthrough (${direction < 0 ? "previous" : "next"})`
          : "adjacent slide with a shared or continuation title",
      });
    }
  }

  return [...expansions.values()];
}

function normalizeContinuationTitle(title: string | undefined): string {
  return (title ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\b(?:continued|continuation|cont\.?|parte|part)\s*\d*\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hasContinuationMarker(title: string | undefined): boolean {
  return /\b(?:continued|continuation|cont\.?|parte|part)\s*\d*\b/i.test(title ?? "");
}

export function isOverviewQuery(query: string): boolean {
  const normalized = query.normalize("NFKC").trim();
  return overviewPatterns.some((pattern) => pattern.test(normalized));
}

export function getRetrievalMode(query: string): RetrievalMode {
  const normalized = query.normalize("NFKC").trim();

  if (conversationalPatterns.some((pattern) => pattern.test(normalized))) {
    return "none";
  }

  if (catalogPatterns.some((pattern) => pattern.test(normalized))) {
    return "catalog";
  }

  return isOverviewQuery(normalized) ? "overview" : "focused";
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
