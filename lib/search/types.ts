export interface SourceChunk {
  id: string;
  deckTitle: string;
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
