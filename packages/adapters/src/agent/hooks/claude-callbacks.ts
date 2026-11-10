import { ClaudeHook, adapters, handle, Harness, mergeReplies, type Handled } from "@stateforge-labs/harness-hooks";
import type { HookTarget } from "../types.ts";
import { observe, type HookObserver } from "./observer.ts";
import { sessionStartGate, syntheticSessionStart, type SessionStartGate } from "./session-start.ts";

/** An SDK hook callback: the input of one hook event in, the hook output out. */
export type HookCallbackBody = (
  input: Record<string, unknown>,
  toolUseId: string | undefined,
  ctx: { readonly signal: AbortSignal },
) => Promise<Record<string, unknown>>;

/** The `hooks` option of the Claude Agent SDK: per event, matcher entries that hold callbacks. */
export interface ClaudeHookOption {
  readonly [event: string]: readonly { readonly matcher?: string; readonly timeout?: number; readonly hooks: readonly HookCallbackBody[] }[];
}

const EVENTS: readonly string[] = Object.values(ClaudeHook).sort();

const asBody = (body: unknown): Record<string, unknown> =>
  typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

function callbackFor(
  event: string,
  adapter: NonNullable<ReturnType<typeof adapters.get>>,
  target: HookTarget,
  observer: HookObserver,
  gate: SessionStartGate,
): HookCallbackBody {
  const run = async (input: Record<string, unknown>, toolUseId: string | undefined): Promise<Handled> => {
    const handled = await handle(adapter, input, target.pipeline);
    await observe(handled, toolUseId, observer);
    return handled;
  };
  if (event === ClaudeHook.SessionStart) {
    return async (input, toolUseId) => {
      gate.take();
      return asBody((await run(input, toolUseId)).body);
    };
  }
  if (event === ClaudeHook.UserPromptSubmit) {
    return async (input, toolUseId) => {
      if (!gate.take()) return asBody((await run(input, toolUseId)).body);
      const started = await run(syntheticSessionStart(input, ClaudeHook.SessionStart), undefined);
      const prompt = await run(input, toolUseId);
      const context = started.reply.context;
      if (!context) return asBody(prompt.body);
      return asBody(adapter.encode(mergeReplies({ context }, prompt.reply), input));
    };
  }
  return async (input, toolUseId) => asBody((await run(input, toolUseId)).body);
}

/** One in-process callback per Claude hook event for the SDK hooks option; the first prompt of a run is preceded by an emulated SessionStart. */
export function claudeHookCallbacks(target: HookTarget, observer: HookObserver): ClaudeHookOption {
  const adapter = adapters.get(Harness.Claude);
  if (!adapter) return {};
  const gate = sessionStartGate();
  const out: Record<string, { readonly hooks: readonly HookCallbackBody[] }[]> = {};
  for (const event of EVENTS) out[event] = [{ hooks: [callbackFor(event, adapter, target, observer, gate)] }];
  return out;
}
