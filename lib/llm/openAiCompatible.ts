import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  DeepInfraSettings,
  LlmMessage,
} from "@/lib/llm/types";
import { validateProviderMessages } from "@/lib/llm/providerCapabilities";

export const DEEPINFRA_BASE_URL = "https://api.deepinfra.com/v1/openai";
export const DEEPINFRA_MODEL = "deepseek-ai/DeepSeek-V4-Flash";
export const DEEPINFRA_STRUCTURED_MODEL = "Qwen/Qwen3-235B-A22B-Instruct-2507";
export type DeepInfraModel = typeof DEEPINFRA_MODEL | typeof DEEPINFRA_STRUCTURED_MODEL;

interface OpenAiCompatibleResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
}

interface OpenAiCompatibleStreamChunk {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
}

export class DeepInfraAuthenticationError extends Error {
  constructor() {
    super("DeepInfra rejected this API key. Check that it is valid and has access.");
    this.name = "DeepInfraAuthenticationError";
  }
}

export async function createDeepInfraChatCompletion({
  settings,
  messages,
  reasoningEffort = "medium",
  maxTokens,
  responseFormat,
  model = DEEPINFRA_MODEL,
}: {
  settings: DeepInfraSettings;
  messages: LlmMessage[];
  reasoningEffort?: "low" | "medium" | "high";
  maxTokens?: number;
  responseFormat?: "json_object";
  model?: DeepInfraModel;
}): Promise<ChatCompletionResult> {
  const apiKey = settings.apiKey.trim();

  if (!apiKey) {
    throw new Error("Add a valid DeepInfra API key before chatting.");
  }

  const validatedMessages = requireValidMessages(messages);

  const body: ChatCompletionRequest = {
    model,
    messages: validatedMessages,
    temperature: 0.2,
    reasoning_effort: reasoningEffort,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
  };

  const response = await fetch(`${DEEPINFRA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await readJsonResponse(response)) as OpenAiCompatibleResponse;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new DeepInfraAuthenticationError();
    }

    const providerMessage =
      typeof payload.error?.message === "string" ? payload.error.message : "";
    throw new Error(
      providerMessage
        ? `DeepInfra request failed (${response.status}): ${providerMessage}`
        : `DeepInfra request failed with status ${response.status}.`,
    );
  }

  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("DeepInfra response did not include an assistant message.");
  }

  return {
    content,
  };
}

export async function createDeepInfraChatCompletionStream({
  settings,
  messages,
  signal,
  reasoningEffort = "medium",
  maxTokens,
  responseFormat,
  model = DEEPINFRA_MODEL,
}: {
  settings: DeepInfraSettings;
  messages: LlmMessage[];
  signal?: AbortSignal;
  reasoningEffort?: "low" | "medium" | "high";
  maxTokens?: number;
  responseFormat?: "json_object";
  model?: DeepInfraModel;
}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = settings.apiKey.trim();

  if (!apiKey) {
    throw new Error("Add a valid DeepInfra API key before chatting.");
  }

  const validatedMessages = requireValidMessages(messages);

  const body: ChatCompletionRequest = {
    model,
    messages: validatedMessages,
    temperature: 0.2,
    reasoning_effort: reasoningEffort,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
    stream: true,
  };
  const response = await fetch(`${DEEPINFRA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const payload = (await readJsonResponse(response)) as OpenAiCompatibleResponse;

    if (response.status === 401 || response.status === 403) {
      throw new DeepInfraAuthenticationError();
    }

    const providerMessage =
      typeof payload.error?.message === "string" ? payload.error.message : "";
    throw new Error(
      providerMessage
        ? `DeepInfra request failed (${response.status}): ${providerMessage}`
        : `DeepInfra request failed with status ${response.status}.`,
    );
  }

  if (!response.body) {
    throw new Error("DeepInfra response did not include a stream.");
  }

  return parseOpenAiEventStream(response.body);
}

function requireValidMessages(messages: LlmMessage[]): LlmMessage[] {
  const validation = validateProviderMessages(messages);
  if (!validation.messages) {
    throw new Error(validation.error ?? "DeepInfra request messages were invalid.");
  }

  return validation.messages;
}

export async function streamDeepInfraChatCompletionViaRoute({
  settings,
  messages,
  onDelta,
  signal,
  reasoningEffort = "medium",
  maxTokens,
  responseFormat,
  model,
}: {
  settings: DeepInfraSettings;
  messages: LlmMessage[];
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
  reasoningEffort?: "low" | "medium" | "high";
  maxTokens?: number;
  responseFormat?: "json_object";
  model?: DeepInfraModel;
}): Promise<ChatCompletionResult> {
  const apiKey = settings.apiKey.trim();

  if (!apiKey) {
    throw new Error("Add a valid DeepInfra API key before chatting.");
  }

  const response = await fetch("/api/deepinfra/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ apiKey, messages, stream: true, reasoningEffort, maxTokens, responseFormat, model }),
    signal,
  });

  if (!response.ok) {
    const payload = (await readJsonResponse(response)) as { error?: unknown };
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `DeepInfra request failed with status ${response.status}.`,
    );
  }

  if (!response.body) {
    throw new Error("DeepInfra response did not include a stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      content += decoder.decode();
      break;
    }

    const delta = decoder.decode(value, { stream: true });
    content += delta;
    onDelta(delta);
  }

  if (!content.trim()) {
    throw new Error("DeepInfra response did not include an assistant message.");
  }

  return { content };
}

function parseOpenAiEventStream(
  upstream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });

          const lines = buffer.split(/\r?\n/);
          buffer = done ? "" : (lines.pop() ?? "");

          for (const line of lines) {
            const delta = readStreamDelta(line);
            if (delta) {
              controller.enqueue(encoder.encode(delta));
            }
          }

          if (done) {
            if (buffer) {
              const delta = readStreamDelta(buffer);
              if (delta) {
                controller.enqueue(encoder.encode(delta));
              }
            }
            break;
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      return reader.cancel();
    },
  });
}

function readStreamDelta(line: string): string | undefined {
  if (!line.startsWith("data:")) {
    return undefined;
  }

  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") {
    return undefined;
  }

  try {
    const payload = JSON.parse(data) as OpenAiCompatibleStreamChunk;
    const content = payload.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : undefined;
  } catch {
    return undefined;
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new DeepInfraAuthenticationError();
      }

      throw new Error(`DeepInfra request failed with status ${response.status}.`);
    }

    throw new Error("DeepInfra response was not valid JSON.");
  }
}
