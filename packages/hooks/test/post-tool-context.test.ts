import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixturesDir } from "./fixtures-dir.ts";
import { Pipeline, adapters, defaultPipeline, handle, type HarnessAdapter, type Middleware } from "../src/index.ts";

const adapter = (id: string): HarnessAdapter => {
  const a = adapters.get(id);
  if (!a) throw new Error(`no adapter ${id}`);
  return a;
};

const load = (harness: string, event: string, name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(fixturesDir, harness, event, `${name}.json`), "utf8"));

const CONTEXT = "POST-TOOL-CONTEXT";
const quiet = (): Pipeline => new Pipeline({ onFault: () => {} });
const withContext: Middleware = () => ({ context: CONTEXT });
const failureRaw = (): Record<string, unknown> => load("claude", "PostToolUseFailure", "01-read");

describe("claude PostToolUse and PostToolUseFailure context", () => {
  test("PostToolUse without middleware context encodes nothing", async () => {
    const out = await handle(adapter("claude"), load("claude", "PostToolUse", "01-write"), defaultPipeline());
    expect(out.body).toEqual({});
  });

  test("PostToolUse context is additionalContext", async () => {
    const out = await handle(adapter("claude"), load("claude", "PostToolUse", "01-write"), quiet().use(withContext));
    expect(out.body).toEqual({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: CONTEXT } });
  });

  test("PostToolUseFailure context is additionalContext", async () => {
    const out = await handle(adapter("claude"), failureRaw(), quiet().use(withContext));
    expect(out.body).toEqual({ hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: CONTEXT } });
  });
});
