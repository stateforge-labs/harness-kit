import { z } from "zod";

/**
 * Shape of `tool_input` for the tools seen in real payloads (27 PreToolUse captures plus the other tool events).
 * Tools not listed here are accepted as any object: the policy is passive, validation only observes.
 * Keys are the fields every captured call carried; extra keys are always allowed.
 */
const loose = z.looseObject;
export const toolInputs: Record<string, z.ZodType> = {
  Bash: loose({ command: z.string(), description: z.string().optional() }),
  Read: loose({ file_path: z.string() }),
  Write: loose({ file_path: z.string(), content: z.string() }),
  Glob: loose({ pattern: z.string(), path: z.string().optional() }),
  Grep: loose({ pattern: z.string(), path: z.string().optional() }),
  Agent: loose({
    prompt: z.string(),
    description: z.string().optional(),
    subagent_type: z.string().optional(),
    model: z.string().optional(),
    run_in_background: z.boolean().optional(),
    name: z.string().optional(),
    team_name: z.string().optional(),
  }),
  ToolSearch: loose({ query: z.string(), max_results: z.number().optional() }),
  TaskCreate: loose({ subject: z.string(), description: z.string().optional() }),
  SendMessage: loose({ to: z.string().optional(), message: z.string().optional(), summary: z.string().optional() }),
  SubagentHandback: loose({ message: z.string() }),
};

/** A `tool_input` that is an object; the per-tool check below adds the tool-specific keys. */
export const anyToolInput = z.record(z.string(), z.unknown());

/** Adds the per-tool `tool_input` issues to an event schema. Use as `.superRefine(checkToolInput)`. */
export function checkToolInput(value: { tool_name?: unknown; tool_input?: unknown }, ctx: z.RefinementCtx, base: (string | number)[] = []) {
  const name = value.tool_name;
  const schema = typeof name === "string" ? toolInputs[name] : undefined;
  if (!schema || value.tool_input === undefined) return;
  const r = schema.safeParse(value.tool_input);
  if (r.success) return;
  for (const issue of r.error.issues) {
    ctx.addIssue({ ...issue, path: [...base, "tool_input", ...issue.path] } as never);
  }
}

/** `tool_response` differs per tool and is never inspected; it only has to be present where the event carries it. */
export const toolResponse = z.any().refine((v) => v !== undefined, { error: "required" });
