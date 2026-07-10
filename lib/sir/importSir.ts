import JSZip from "jszip";

import { parseSirMarkdown } from "./parseSirMarkdown";
import type { ParsedSirFile, SirValidationResult } from "./types";
import { validateSirFile } from "./validateSir";

export async function parseSirFile(
  input: ArrayBuffer | Uint8Array,
  knownValidation?: Extract<SirValidationResult, { valid: true }>,
): Promise<ParsedSirFile> {
  const validation = knownValidation ?? (await validateSirFile(input));

  if (!validation.valid) {
    const messages = validation.errors.map((error) => error.message).join("; ");
    throw new Error(`Invalid SIR file: ${messages}`);
  }

  const zip = await JSZip.loadAsync(input);
  const markdown = await zip.file("sir.md")!.async("string");
  const slides = parseSirMarkdown(markdown, validation.sources);

  return {
    manifest: validation.manifest,
    sources: validation.sources,
    slides,
    imagePaths: validation.imagePaths,
  };
}
