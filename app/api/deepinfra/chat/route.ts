import { NextResponse } from "next/server";

import {
  DeepInfraAuthenticationError,
  createDeepInfraChatCompletion,
} from "@/lib/llm/openAiCompatible";
import type { LlmMessage, LlmMessageRole } from "@/lib/llm/types";

const allowedRoles = new Set<LlmMessageRole>([
  "system",
  "developer",
  "user",
  "assistant",
]);

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

  if (!Array.isArray(messages)) {
    return undefined;
  }

  const parsedMessages: LlmMessage[] = [];

  for (const message of messages) {
    if (
      !message ||
      typeof message !== "object" ||
      !("role" in message) ||
      !("content" in message) ||
      typeof message.role !== "string" ||
      typeof message.content !== "string" ||
      !allowedRoles.has(message.role as LlmMessageRole)
    ) {
      return undefined;
    }

    parsedMessages.push({
      role: message.role as LlmMessageRole,
      content: message.content,
    });
  }

  return parsedMessages;
}
