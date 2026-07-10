export interface SirV1Manifest {
  sir: 1;
  title: string;
  language: string;
  slide_count: number;
}

export interface SirV2Manifest {
  sir: 2;
  title: string;
  language: string;
  source_count: number;
  slide_count: number;
}

export type SirManifest = SirV1Manifest | SirV2Manifest;

export type SirSourceMediaType = "pdf" | "image" | "markdown";

export interface SirV2Source {
  source: number;
  title: string;
  path: string;
  type: SirSourceMediaType;
  language: string;
  slide_start: number;
  slide_count: number;
}

export interface ParsedSirSource {
  sourceNumber: number;
  title: string;
  originalPath: string;
  mediaType: SirSourceMediaType | "sir-v1";
  language: string;
  slideStart: number;
  slideCount: number;
}

export interface SirValidationError {
  code: string;
  message: string;
  path?: string;
}

export type SirValidationResult =
  | {
      valid: true;
      errors: [];
      manifest: SirManifest;
      sources: ParsedSirSource[];
      slideMarkers: number[];
      imagePaths: string[];
    }
  | {
      valid: false;
      errors: SirValidationError[];
    };

export interface ParsedSirSlide {
  slideNumber: number;
  sourceNumber: number;
  sourceSlideNumber: number;
  title?: string;
  markdown: string;
}

export interface ParsedSirFile {
  manifest: SirManifest;
  sources: ParsedSirSource[];
  slides: ParsedSirSlide[];
  imagePaths: string[];
}
