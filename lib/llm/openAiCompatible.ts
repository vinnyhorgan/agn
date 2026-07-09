import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  DeepInfraSettings,
  LlmMessage,
} from "@/lib/llm/types";

export const DEEPINFRA_BASE_URL = "https://api.deepinfra.com/v1/openai";
export const DEEPINFRA_MODEL = "deepseek-ai/DeepSeek-V4-Flash";

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

export class DeepInfraAuthenticationError extends Error {
  constructor() {
    super("DeepInfra rejected this API key. Check that it is valid and has access.");
    this.name = "DeepInfraAuthenticationError";
  }
}

export async function createDeepInfraChatCompletion({
  settings,
  messages,
}: {
  settings: DeepInfraSettings;
  messages: LlmMessage[];
}): Promise<ChatCompletionResult> {
  const apiKey = settings.apiKey.trim();

  if (!apiKey) {
    throw new Error("Add a valid DeepInfra API key before chatting.");
  }

  const body: ChatCompletionRequest = {
    model: DEEPINFRA_MODEL,
    messages,
    temperature: 0.2,
    reasoning_effort: "high",
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
