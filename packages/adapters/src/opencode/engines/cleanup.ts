import type { AfterContext } from "../../driver/port.ts";
import { runOnce } from "../../engine/run-once.ts";
import { OpenCodeCleanup, OpenCodeCli } from "../constants.ts";
import { opencodeSessionDeleteArgs, opencodeSessionListArgs, parseSessionList } from "../launch.ts";

function remove(ctx: AfterContext, id: string): Promise<string | null> {
  return runOnce(ctx.input, ctx.io, opencodeSessionDeleteArgs(id), OpenCodeCleanup.CommandTimeoutMs);
}

async function sweepTitled(ctx: AfterContext): Promise<void> {
  const listed = await runOnce(ctx.input, ctx.io, opencodeSessionListArgs(), OpenCodeCleanup.CommandTimeoutMs);
  if (listed === null) {
    return;
  }
  for (const row of parseSessionList(listed)) {
    if (row.title === OpenCodeCli.StaticTitle) {
      await remove(ctx, row.id);
    }
  }
}

export async function removeResidue(ctx: AfterContext, session: string | null): Promise<void> {
  if (session !== null) {
    await remove(ctx, session);
    return;
  }
  await sweepTitled(ctx);
  await ctx.io.sleep(OpenCodeCleanup.SettleMs);
  await sweepTitled(ctx);
}
