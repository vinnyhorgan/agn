export interface SirManifest {
  sir: 1;
  title: string;
  language: string;
  slide_count: number;
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
      slideMarkers: number[];
      imagePaths: string[];
    }
  | {
      valid: false;
      errors: SirValidationError[];
    };

export interface ParsedSirSlide {
  slideNumber: number;
  title?: string;
  markdown: string;
}

export interface ParsedSirFile {
  manifest: SirManifest;
  slides: ParsedSirSlide[];
  imagePaths: string[];
}
