import type { HookArea } from "./hooks.ts";

type HookFn = (input: unknown) => Promise<void>;

export type PluginContext = Record<HookArea, { hook(name: string, fn: HookFn): unknown }> & {
  session: { synthetic?(input: { sessionID: string; text: string }): Promise<unknown> };
  event: { subscribe(filter: undefined, options: Record<string, never>): Promise<AsyncIterable<{ type?: unknown; data?: unknown }>> };
};
