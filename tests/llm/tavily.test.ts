import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/tavily/search/route";

describe("Tavily search route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the bounded one-credit search configuration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        query: "current SQL standard",
        results: [
          {
            title: "SQL standard",
            url: "https://example.com/sql",
            content: "Current standard information.",
            score: 0.9,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/tavily/search", {
        method: "POST",
        body: JSON.stringify({
          apiKey: "tvly-secret",
          query: "current SQL standard",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tvly-secret",
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    });
  });

  it("rejects a missing key without contacting Tavily", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/tavily/search", {
        method: "POST",
        body: JSON.stringify({ query: "latest database news" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
