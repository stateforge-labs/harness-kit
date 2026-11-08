import type { OpenCodeAnswer } from "../../src/adapters/opencode/answer.ts";
import { pluginEnv } from "../../src/env.ts";
import type { PluginContext } from "./context.ts";

const streak = new Map<string, number>();

export async function keepGoing(ctx: PluginContext, input: unknown, answer: OpenCodeAnswer | null): Promise<void> {
  const sessionID = (input as { sessionID?: unknown } | null)?.sessionID;
  if (typeof sessionID !== "string") return;
  const text = answer?.continue;
  if (typeof text !== "string" || text === "") {
    streak.delete(sessionID);
    return;
  }
  const count = streak.get(sessionID) ?? 0;
  if (count >= pluginEnv().maxContinues || typeof ctx.session.synthetic !== "function") return;
  streak.set(sessionID, count + 1);
  try {
    await ctx.session.synthetic({ sessionID, text });
  } catch {
    return;
  }
}
