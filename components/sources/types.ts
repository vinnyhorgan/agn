import type { ParsedSirFile } from "@/lib/sir/types";

export interface BrowserSirDeck extends ParsedSirFile {
  id: string;
  sourceLabel: string;
  fileName: string;
  imageUrlsBySlideNumber: Record<number, string>;
}

export interface SelectedSource {
  deckId: string;
  slideNumber: number;
  chunkId?: string;
}
