// tool.execute.after: R-2026-11-07-08, opencode 2.2.6
import { z } from "zod";
import { common } from "../common.ts";
import { ToolStatus } from "../enums.ts";

export const event = "tool.execute.after";

export const schema = z.looseObject({
  ...common,
  agent: z.string(),
  id: z.string(),
  messageID: z.string(),
  tool: z.string(),
  input: z.unknown(),
  status: ToolStatus,
  /** { output, content, metadata? } as seen; the content is never logged. */
  result: z.looseObject({ output: z.unknown(), content: z.array(z.unknown()), metadata: z.unknown().optional() }),
});
