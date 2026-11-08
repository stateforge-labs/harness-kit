import { z } from "zod";
import { common } from "../common.ts";
import { ToolStatus } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  agent: z.string(),
  id: z.string(),
  messageID: z.string(),
  tool: z.string(),
  input: z.unknown(),
  status: ToolStatus,
  result: z.looseObject({ output: z.unknown(), content: z.array(z.unknown()), metadata: z.unknown().optional() }),
});
