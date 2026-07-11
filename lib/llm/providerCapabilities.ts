import type { LlmMessage, LlmMessageRole } from "@/lib/llm/types";

export interface ProviderCapabilityProfile {
  id: string;
  allowedRoles: readonly LlmMessageRole[];
  maxMessages: number;
  maxMessageCharacters: number;
  maxRequestCharacters: number;
  supportsStreaming: boolean;
  supportsReasoningEffort: boolean;
}

export const deepInfraCapabilityProfile: ProviderCapabilityProfile = {
  id: "deepinfra-openai-chat-v1",
  allowedRoles: ["system", "user", "assistant"],
  maxMessages: 30,
  maxMessageCharacters: 120_000,
  maxRequestCharacters: 300_000,
  supportsStreaming: true,
  supportsReasoningEffort: true,
};

export function validateProviderMessages(
  messages: unknown,
  profile: ProviderCapabilityProfile = deepInfraCapabilityProfile,
): { messages?: LlmMessage[]; error?: string } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: "At least one chat message is required." };
  }

  if (messages.length > profile.maxMessages) {
    return { error: `Chat history exceeds the ${profile.maxMessages}-message limit.` };
  }

  const allowedRoles = new Set<string>(profile.allowedRoles);
  const parsed: LlmMessage[] = [];
  let totalCharacters = 0;

  for (const message of messages) {
    if (!message || typeof message !== "object") {
      return { error: "Every chat message must be an object." };
    }

    const candidate = message as Record<string, unknown>;
    if (typeof candidate.role !== "string" || !allowedRoles.has(candidate.role)) {
      return { error: `The message role “${String(candidate.role)}” is not supported by DeepInfra.` };
    }

    if (typeof candidate.content !== "string" || !candidate.content.trim()) {
      return { error: "Chat messages cannot be empty." };
    }

    if (candidate.content.length > profile.maxMessageCharacters) {
      return { error: "A chat message exceeds the provider size limit." };
    }

    totalCharacters += candidate.content.length;
    if (totalCharacters > profile.maxRequestCharacters) {
      return { error: "The combined chat request exceeds the provider size limit." };
    }

    parsed.push({
      role: candidate.role as LlmMessageRole,
      content: candidate.content,
    });
  }

  return { messages: parsed };
}
