import { count, obj } from "../core/rows.ts";
import { OpenCodeField } from "./constants.ts";
import type { OpenCodeMessage } from "./parts.ts";

export interface OpenCodeMessageUsage {
  readonly role: string | null;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly providerId: string | null;
  readonly modelId: string | null;
}

export function messageUsage(message: OpenCodeMessage): OpenCodeMessageUsage {
  const tokens = obj(message.row[OpenCodeField.Tokens]);
  const cache = obj(tokens[OpenCodeField.Cache]);
  return {
    role: message.role,
    input: count(tokens[OpenCodeField.Input]),
    output: count(tokens[OpenCodeField.Output]),
    cacheRead: count(cache[OpenCodeField.Read]),
    cacheWrite: count(cache[OpenCodeField.Write]),
    providerId: message.providerId,
    modelId: message.modelId,
  };
}

export function modelRef(usage: Pick<OpenCodeMessageUsage, "providerId" | "modelId">): string | null {
  return usage.providerId === null || usage.modelId === null ? usage.modelId : `${usage.providerId}/${usage.modelId}`;
}
