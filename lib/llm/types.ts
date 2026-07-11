import type { SourceChunk } from "@/lib/search/types";

export type LlmMessageRole = "system" | "developer" | "user" | "assistant";

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface DeepInfraSettings {
  apiKey: string;
}

export interface GroundedPromptInput {
  question: string;
  sourceChunks: SourceChunk[];
  history?: ConversationTurn[];
}

export interface ConversationTurn {
  question: string;
  answer: string;
}

export interface LibrarySource {
  deckId: string;
  deckTitle: string;
  sourceLabel: string;
  sourceTitle: string;
  sourcePath: string;
  sourceMediaType: SourceChunk["sourceMediaType"];
  slideCount: number;
}

export interface ChatCompletionRequest {
  model: string;
  messages: LlmMessage[];
  temperature: number;
  reasoning_effort?: "low" | "medium" | "high";
  max_tokens?: number;
  response_format?: { type: "json_object" };
  stream?: boolean;
}

export interface ChatCompletionResult {
  content: string;
}
