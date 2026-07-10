import type { TavilySearchResponse, WebSearchResult } from "@/lib/web/types";

const explicitWebPatterns = [
  /\b(?:search|browse|check|find)\b.*\b(?:web|online|internet)\b/i,
  /\blook (?:this )?up\b.*\b(?:web|online|internet)\b/i,
  /\b(?:cerca|controlla|consulta)\b.*\b(?:web|online|internet)\b/i,
];
const timeSensitivePatterns = [
  /\b(?:latest|current|currently|today|recent|recently|news|this week|this month|this year)\b/i,
  /\b(?:ultimo|ultima|ultimi|ultime|attuale|attualmente|oggi|recente|recenti|notizie|questa settimana|questo mese|quest'anno)\b/i,
];

export function shouldSearchWeb(query: string): boolean {
  const normalized = query.normalize("NFKC").trim();
  return [...explicitWebPatterns, ...timeSensitivePatterns].some((pattern) =>
    pattern.test(normalized),
  );
}

export function isExplicitWebSearch(query: string): boolean {
  const normalized = query.normalize("NFKC").trim();
  return explicitWebPatterns.some((pattern) => pattern.test(normalized));
}

export async function searchWebViaRoute({
  apiKey,
  query,
  signal,
}: {
  apiKey: string;
  query: string;
  signal?: AbortSignal;
}): Promise<WebSearchResult[]> {
  const response = await fetch("/api/tavily/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: apiKey.trim(), query: query.trim() }),
    signal,
  });
  const payload = (await response.json()) as TavilySearchResponse & {
    error?: unknown;
  };

  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Tavily request failed with status ${response.status}.`,
    );
  }

  return Array.isArray(payload.results) ? payload.results : [];
}
