import { z } from "zod";

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

export const anyToolInput = z.record(z.string(), z.unknown());

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

export const toolResponse = z.any().refine((v) => v !== undefined, { error: "required" });
