import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Harness } from "../src/core/event.ts";
import { emit, parseArgs } from "./lib/emit.ts";

export const HARNESSES: readonly string[] = Object.values(Harness);
const CONSTANTS: Record<string, string> = { [Harness.Claude]: "ClaudeHook", [Harness.Codex]: "CodexHook", [Harness.OpenCode]: "OpenCodeHook" };

const { check, root } = parseArgs();
const files = new Map<string, string>();
const summary: string[] = [];

for (const harness of HARNESSES) {
  const adapterDir = join(root, "src", "adapters", harness);
  const dir = join(adapterDir, "handlers");
  const names = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !["index.ts", "types.ts"].includes(f))
    .map((f) => f.slice(0, -3))
    .sort();

  const schemaDir = join(adapterDir, "events");
  const schemaNames = readdirSync(schemaDir).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3)).sort();
  const noSchema = names.filter((n) => !schemaNames.includes(n));
  if (noSchema.length) throw new Error(`${harness}: no payload schema for: ${noSchema.join(", ")}`);
  const noHandler = schemaNames.filter((n) => !names.includes(n));
  if (noHandler.length) throw new Error(`${harness}: no handler for: ${noHandler.join(", ")}`);

  files.set(
    join(dir, "index.ts"),
    [
      'import type { EventHandler } from "./types.ts";',
      ...names.map((n) => `import { handler as ${n} } from "./${n}.ts";`),
      "",
      "export const handlers: ReadonlyMap<string, EventHandler> = new Map([",
      ...names.map((n) => `  [${n}.event, ${n}],`),
      "]);",
      "",
    ].join("\n"),
  );
  const hookConst = CONSTANTS[harness]!;
  files.set(
    join(adapterDir, "schemas.ts"),
    [
      'import type { z } from "zod";',
      `import { ${hookConst} } from "./names.ts";`,
      ...schemaNames.map((n) => `import { schema as ${n} } from "./events/${n}.ts";`),
      "",
      "export const schemas: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([",
      ...schemaNames.map((n) => `  [${hookConst}.${n}, ${n}],`),
      "]);",
      "",
    ].join("\n"),
  );
  summary.push(`${harness}: ${names.length} handlers and ${schemaNames.length} schemas`);
}

const code = emit(files, check, [], root);
if (!check && code === 0) console.log(`registered ${summary.join("; ")}`);
process.exit(code);
