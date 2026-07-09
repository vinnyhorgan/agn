import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEEPINFRA_BASE_URL,
  DEEPINFRA_MODEL,
  createDeepInfraChatCompletion,
} from "../../lib/llm/openAiCompatible";
import type { LlmMessage } from "../../lib/llm/types";

const messages: LlmMessage[] = [
  {
    role: "user",
    content: "What does slide 1 say?",
  },
];

describe("DeepInfra chat completion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the fixed DeepInfra model and high reasoning effort", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Supported answer. [Slide 1]" } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createDeepInfraChatCompletion({
      settings: { apiKey: "deepinfra-key" },
      messages,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${DEEPINFRA_BASE_URL}/chat/completions`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer deepinfra-key",
        }),
      }),
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body));

    expect(body).toMatchObject({
      model: DEEPINFRA_MODEL,
      messages,
      temperature: 0.2,
      reasoning_effort: "high",
    });
  });

  it("does not call DeepInfra when the API key is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createDeepInfraChatCompletion({
        settings: { apiKey: "   " },
        messages,
      }),
    ).rejects.toThrow("Add a valid DeepInfra API key before chatting.");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the DeepInfra authentication message for 401 and 403 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createDeepInfraChatCompletion({
        settings: { apiKey: "bad-key" },
        messages,
      }),
    ).rejects.toThrow(
      "DeepInfra rejected this API key. Check that it is valid and has access.",
    );
  });
});
