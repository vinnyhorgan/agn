import type { WebSearchResult } from "@/lib/web/types";

const webCitationPattern = /\[Web\s+(\d+)\]/gi;

export function repairWebCitations(
  content: string,
  webResults: WebSearchResult[],
): string {
  return content
    .replace(webCitationPattern, (_, indexText: string) => {
      const index = Number(indexText);
      const result = webResults[index - 1];

      if (!result) {
        return "";
      }

      const title = result.title.replace(/[\[\]]/g, "").trim() || `Web ${index}`;
      return `[Web ${index} — ${title}](<${result.url}>)`;
    })
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
