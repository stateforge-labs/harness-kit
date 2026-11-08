import { OpenCodeHook, type OpenCodeHookName } from "../../src/adapters/opencode/names.ts";
import { pluginEnv } from "../../src/env.ts";
import type { PluginContext } from "./context.ts";
import { keepGoing } from "./continues.ts";
import { forward } from "./forward.ts";
import { FORWARDED_EVENTS, FORWARDED_HOOKS, splitHook } from "./hooks.ts";

const PLUGIN_ID = "harness-hooks";

async function onHook(ctx: PluginContext, hook: OpenCodeHookName, input: unknown): Promise<void> {
  const answer = await forward(hook, input);
  if (hook === OpenCodeHook.ToolExecuteBefore) {
    if (typeof answer?.deny === "string") throw new Error(answer.deny);
    const env = pluginEnv();
    if (!answer && env.failClosed) throw new Error(env.denyReason);
  } else if (hook === OpenCodeHook.SessionExperimentalIdle) {
    await keepGoing(ctx, input, answer);
  }
}

function register(ctx: PluginContext): void {
  for (const hook of FORWARDED_HOOKS) {
    const { area, name } = splitHook(hook);
    try {
      ctx[area].hook(name, (input) => onHook(ctx, hook, input));
    } catch {
      continue;
    }
  }
}

async function subscribe(ctx: PluginContext): Promise<void> {
  try {
    const stream = await ctx.event.subscribe(undefined, {});
    void (async () => {
      for await (const e of stream) {
        if (typeof e.type === "string" && FORWARDED_EVENTS.has(e.type)) void forward(e.type, e.data);
      }
    })().catch(() => {});
  } catch {
    return;
  }
}

export default {
  id: PLUGIN_ID,
  async setup(ctx: PluginContext): Promise<void> {
    register(ctx);
    await subscribe(ctx);
  },
};
