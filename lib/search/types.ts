export interface SourceChunk {
  id: string;
  deckId: string;
  deckTitle: string;
  sourceLabel?: string;
  sourceTitle: string;
  sourcePath: string;
  sourceMediaType: "pdf" | "image" | "markdown" | "sir-v1";
  slideNumber: number;
  sourceSlideNumber: number;
  slideTitle?: string;
  headingPath?: string[];
  text: string;
  slideImagePath: string;
}

export interface SearchResult {
  chunk: SourceChunk;
  score: number;
  matchedTerms: string[];
  snippet: string;
}
