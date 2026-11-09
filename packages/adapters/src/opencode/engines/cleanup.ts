import type { CleanupContext } from "../../driver/port.ts";
import { runOnce } from "../../engine/run-once.ts";
import { OpenCodeCleanup, OpenCodeCli } from "../constants.ts";
import { opencodeSessionDeleteArgs, opencodeSessionListArgs, parseSessionList } from "../launch.ts";

function remove(ctx: CleanupContext, id: string): Promise<string | null> {
  return runOnce(ctx.input, ctx.io, opencodeSessionDeleteArgs(id), OpenCodeCleanup.CommandTimeoutMs);
}

async function sweepTitled(ctx: CleanupContext, title: string): Promise<void> {
  const listed = await runOnce(ctx.input, ctx.io, opencodeSessionListArgs(), OpenCodeCleanup.CommandTimeoutMs);
  if (listed === null) {
    return;
  }
  for (const row of parseSessionList(listed)) {
    if (row.title === title) {
      await remove(ctx, row.id);
    }
  }
}

export function runTitle(args: readonly string[]): string {
  const at = args.indexOf(OpenCodeCli.Title);
  return at === -1 ? OpenCodeCli.StaticTitle : (args[at + 1] ?? OpenCodeCli.StaticTitle);
}

export async function removeResidue(ctx: CleanupContext, title: string, session: string | null): Promise<void> {
  if (session !== null) {
    await remove(ctx, session);
    return;
  }
  await sweepTitled(ctx, title);
  await ctx.io.sleep(OpenCodeCleanup.SettleMs);
  await sweepTitled(ctx, title);
}
