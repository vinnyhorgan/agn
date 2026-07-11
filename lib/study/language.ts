import type { SourceChunk } from "@/lib/search/types";

const languageNames: Record<string, string> = {
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
};

export function inferStudyLanguage(chunks: SourceChunk[]): string {
  const counts = new Map<string, number>();
  for (const chunk of chunks) {
    const declared = chunk.sourceLanguage?.normalize("NFKC").trim();
    if (!declared) continue;
    const normalized = declared.toLocaleLowerCase().replace(/_/g, "-");
    const base = normalized.split("-")[0]!;
    const language = languageNames[base] ?? declared;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]
    ?? "the language of the uploaded material";
}
