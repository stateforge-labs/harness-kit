// PostToolBatch: 7 real payloads from 6 captures (R-2026-11-07-05); judged spec: evidence/judged/PostToolBatch.json
// No tool_calls item carried more than tool_name, tool_input, tool_use_id and tool_response (5 captures).
// UNRESOLVED: whether mcp_server appears on an item (no MCP tool was called in any capture).
import { z } from "zod";
import { common } from "../common.ts";
import { anyToolInput, checkToolInput, toolResponse } from "../tool-input.ts";

const call = z
  .looseObject({
    tool_name: z.string(),
    tool_input: anyToolInput,
    tool_use_id: z.string(),
    tool_response: toolResponse,
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));

export const schema = z.looseObject({
  ...common,
  hook_event_name: z.literal("PostToolBatch"),
  tool_calls: z.array(call),
});
