import { NextResponse } from "next/server";

import {
  DeepInfraAuthenticationError,
  createDeepInfraChatCompletion,
  createDeepInfraChatCompletionStream,
} from "@/lib/llm/openAiCompatible";
import { validateProviderMessages } from "@/lib/llm/providerCapabilities";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "DeepInfra request body was not valid JSON." },
      { status: 400 },
    );
  }

  const apiKey = readApiKey(payload);
  const messageValidation = readMessages(payload);
  const shouldStream = readShouldStream(payload);

  if (!apiKey) {
    return NextResponse.json(
      { error: "Add a valid DeepInfra API key before chatting." },
      { status: 400 },
    );
  }

  if (!messageValidation.messages) {
    return NextResponse.json(
      { error: messageValidation.error ?? "DeepInfra request messages were invalid." },
      { status: 400 },
    );
  }

  try {
    if (shouldStream) {
      const stream = await createDeepInfraChatCompletionStream({
        settings: { apiKey },
        messages: messageValidation.messages,
        signal: request.signal,
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const result = await createDeepInfraChatCompletion({
      settings: { apiKey },
      messages: messageValidation.messages,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not complete the DeepInfra request.";
    const status = error instanceof DeepInfraAuthenticationError ? 401 : 502;

    return NextResponse.json({ error: message }, { status });
  }
}

function readShouldStream(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "stream" in payload &&
      payload.stream === true,
  );
}

function readApiKey(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("apiKey" in payload)) {
    return undefined;
  }

  const apiKey = payload.apiKey;

  return typeof apiKey === "string" ? apiKey.trim() : undefined;
}

function readMessages(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("messages" in payload)) {
    return validateProviderMessages(undefined);
  }
  return validateProviderMessages(payload.messages);
}
