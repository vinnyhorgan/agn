import { NextResponse } from "next/server";

import {
  DeepInfraAuthenticationError,
  createDeepInfraChatCompletion,
  createDeepInfraChatCompletionStream,
} from "@/lib/llm/openAiCompatible";
import type { LlmMessage, LlmMessageRole } from "@/lib/llm/types";

const allowedRoles = new Set<LlmMessageRole>([
  "system",
  "developer",
  "user",
  "assistant",
]);
const maxMessageCount = 30;
const maxMessageCharacters = 120_000;
const maxRequestCharacters = 300_000;

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
  const messages = readMessages(payload);
  const shouldStream = readShouldStream(payload);

  if (!apiKey) {
    return NextResponse.json(
      { error: "Add a valid DeepInfra API key before chatting." },
      { status: 400 },
    );
  }

  if (!messages) {
    return NextResponse.json(
      { error: "DeepInfra request messages were invalid." },
      { status: 400 },
    );
  }

  try {
    if (shouldStream) {
      const stream = await createDeepInfraChatCompletionStream({
        settings: { apiKey },
        messages,
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
      messages,
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

function readMessages(payload: unknown): LlmMessage[] | undefined {
  if (!payload || typeof payload !== "object" || !("messages" in payload)) {
    return undefined;
  }

  const messages = payload.messages;

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > maxMessageCount
  ) {
    return undefined;
  }

  const parsedMessages: LlmMessage[] = [];
  let totalCharacters = 0;

  for (const message of messages) {
    if (
      !message ||
      typeof message !== "object" ||
      !("role" in message) ||
      !("content" in message) ||
      typeof message.role !== "string" ||
      typeof message.content !== "string" ||
      message.content.length > maxMessageCharacters ||
      !allowedRoles.has(message.role as LlmMessageRole)
    ) {
      return undefined;
    }

    totalCharacters += message.content.length;
    if (totalCharacters > maxRequestCharacters) {
      return undefined;
    }

    parsedMessages.push({
      role: message.role as LlmMessageRole,
      content: message.content,
    });
  }

  return parsedMessages;
}
