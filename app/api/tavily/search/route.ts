import { NextResponse } from "next/server";

import type { TavilySearchResponse, WebSearchResult } from "@/lib/web/types";

const tavilySearchUrl = "https://api.tavily.com/search";
const maxQueryCharacters = 2_000;
const maxResults = 5;

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Tavily request body was not valid JSON." },
      { status: 400 },
    );
  }

  const apiKey = readString(payload, "apiKey");
  const query = readString(payload, "query");

  if (!apiKey) {
    return NextResponse.json(
      { error: "Add a valid Tavily API key before searching the web." },
      { status: 400 },
    );
  }

  if (!query || query.length > maxQueryCharacters) {
    return NextResponse.json(
      { error: "Tavily search query was invalid." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(tavilySearchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
      signal: request.signal,
    });
    const result = (await response.json()) as {
      query?: unknown;
      results?: unknown;
      detail?: unknown;
    };

    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 401 : 502;
      return NextResponse.json(
        {
          error:
            status === 401
              ? "Tavily rejected this API key. Check that it is valid."
              : `Tavily search failed with status ${response.status}.`,
        },
        { status },
      );
    }

    const output: TavilySearchResponse = {
      query: typeof result.query === "string" ? result.query : query,
      results: readResults(result.results),
    };
    return NextResponse.json(output);
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Tavily search was stopped." }, { status: 499 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not complete the Tavily search.",
      },
      { status: 502 },
    );
  }
}

function readString(payload: unknown, field: "apiKey" | "query"): string | undefined {
  if (!payload || typeof payload !== "object" || !(field in payload)) {
    return undefined;
  }

  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" ? value.trim() : undefined;
}

function readResults(value: unknown): WebSearchResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, maxResults).flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const result = item as Record<string, unknown>;
    if (
      typeof result.title !== "string" ||
      typeof result.url !== "string" ||
      typeof result.content !== "string" ||
      typeof result.score !== "number"
    ) {
      return [];
    }

    let url: URL;
    try {
      url = new URL(result.url);
    } catch {
      return [];
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return [];
    }

    return [{
      title: result.title.slice(0, 500),
      url: url.toString().slice(0, 2_000),
      content: result.content.slice(0, 4_000),
      score: result.score,
    }];
  });
}
