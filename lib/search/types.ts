export interface SourceChunk {
  id: string;
  deckId: string;
  deckTitle: string;
  sourceLabel?: string;
  slideNumber: number;
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
