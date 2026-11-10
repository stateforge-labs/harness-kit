import { denyText, type Handled } from "@stateforge-labs/harness-hooks";
import type { HookPoint } from "../constants.ts";
import { CONTEXT_POINTS } from "./constants.ts";

/** What the consumer hears about the pipeline's answers; the observer decides nothing. */
export interface HookObserver {
  refused(r: { readonly id: string; readonly tool: string; readonly reason: string; readonly text: string | null }): void;
  context(point: HookPoint, text: string): void;
}

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

async function notify(call: () => void): Promise<void> {
  await Promise.allSettled([Promise.resolve().then(call)]);
}

/** Tells the observer what the pipeline answered; an observer that throws never changes the answer. */
export async function observe(handled: Handled, toolUseId: string | undefined, observer: HookObserver): Promise<void> {
  const { reply, decoded, common } = handled;
  const tool = decoded.event?.tool;
  const name = tool?.name ?? text(common.tool_name);
  if (reply.deny && name !== null) {
    const { deny } = reply;
    const id = tool?.callId ?? toolUseId ?? "";
    await notify(() => observer.refused({ id, tool: name, reason: deny.reason, text: text(denyText(deny)) }));
  }
  const point = decoded.event ? CONTEXT_POINTS[decoded.event.kind] : undefined;
  if (reply.context && point !== undefined) {
    const { context } = reply;
    await notify(() => observer.context(point, context));
  }
}
