import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/deepinfra/chat/route";
import {
  DEEPINFRA_BASE_URL,
  DEEPINFRA_MODEL,
  createDeepInfraChatCompletion,
  createDeepInfraChatCompletionStream,
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

  it("uses the fixed DeepInfra model and medium reasoning effort", async () => {
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
      reasoning_effort: "medium",
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

  it("converts OpenAI-compatible events into a plain text stream", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
              ),
            );
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"world"}}]}\n\ndata: [DONE]\n\n',
              ),
            );
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const stream = await createDeepInfraChatCompletionStream({
      settings: { apiKey: "deepinfra-key" },
      messages,
    });

    expect(await new Response(stream).text()).toBe("Hello world");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      stream: true,
      reasoning_effort: "medium",
    });
  });

  it("rejects unsupported developer-role messages before contacting DeepInfra", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/deepinfra/chat", {
        method: "POST",
        body: JSON.stringify({
          apiKey: "deepinfra-key",
          messages: [{ role: "developer", content: "Dynamic context" }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported roles in the provider client before a paid request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createDeepInfraChatCompletion({
        settings: { apiKey: "deepinfra-key" },
        messages: [{ role: "developer", content: "Dynamic context" }],
      }),
    ).rejects.toThrow("not supported by DeepInfra");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty messages locally with an actionable 400 error", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/deepinfra/chat", {
        method: "POST",
        body: JSON.stringify({
          apiKey: "deepinfra-key",
          messages: [{ role: "user", content: "   " }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Chat messages cannot be empty.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
