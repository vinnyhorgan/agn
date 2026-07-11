import { describe, expect, it } from "vitest";

import { POST as searchTavily } from "../../app/api/tavily/search/route";
import { buildGroundedMessages } from "../../lib/llm/groundedPrompt";
import {
  DEEPINFRA_MODEL,
  createDeepInfraChatCompletionStream,
} from "../../lib/llm/openAiCompatible";

function requireSecret(name: "DEEPINFRA_API_KEY" | "TAVILY_API_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set to run the live provider harness.`);
  }
  return value;
}

describe("live AGN provider harness", () => {
  it("searches Tavily and streams a grounded DeepInfra answer", async () => {
    const tavilyResponse = await searchTavily(
      new Request("http://localhost/api/tavily/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: requireSecret("TAVILY_API_KEY"),
          query: "official current TypeScript release",
        }),
      }),
    );
    expect(tavilyResponse.status).toBe(200);
    const tavilyPayload = (await tavilyResponse.json()) as {
      results?: Array<{ title: string; url: string; content: string; score: number }>;
    };
    expect(tavilyPayload.results?.length).toBeGreaterThan(0);

    const messages = buildGroundedMessages({
      question: "In one sentence, summarize what the web evidence says and cite [Web 1].",
      sourceChunks: [],
      runtimeModel: `${DEEPINFRA_MODEL} via DeepInfra`,
      webResults: tavilyPayload.results?.slice(0, 3) ?? [],
    });
    expect(messages.every((message) => message.role !== "developer")).toBe(true);

    const stream = await createDeepInfraChatCompletionStream({
      settings: { apiKey: requireSecret("DEEPINFRA_API_KEY") },
      messages,
    });
    const answer = await new Response(stream).text();

    expect(answer.trim().length).toBeGreaterThan(20);
    expect(answer).toContain("[Web 1]");
  });
});
