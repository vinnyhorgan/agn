import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  LlmMessage,
  ProviderSettings,
} from "@/lib/llm/types";

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

export async function createOpenAiCompatibleChatCompletion({
  settings,
  messages,
}: {
  settings: ProviderSettings;
  messages: LlmMessage[];
}): Promise<ChatCompletionResult> {
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
  const model = settings.model.trim();
  const apiKey = settings.apiKey.trim();

  if (!baseUrl) {
    throw new Error("Enter a provider base URL.");
  }

  if (!model) {
    throw new Error("Enter a model name.");
  }

  if (!apiKey) {
    throw new Error("Enter an API key.");
  }

  const body: ChatCompletionRequest = {
    model,
    messages,
    temperature: 0.2,
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await readJsonResponse(response)) as OpenAiCompatibleResponse;

  if (!response.ok) {
    const providerMessage =
      typeof payload.error?.message === "string" ? payload.error.message : "";
    throw new Error(
      providerMessage
        ? `Provider request failed (${response.status}): ${providerMessage}`
        : `Provider request failed with status ${response.status}.`,
    );
  }

  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Provider response did not include an assistant message.");
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
      throw new Error(`Provider request failed with status ${response.status}.`);
    }

    throw new Error("Provider response was not valid JSON.");
  }
}
