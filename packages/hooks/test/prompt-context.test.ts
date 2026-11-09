import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixturesDir } from "./fixtures-dir.ts";
import { Pipeline, adapters, defaultPipeline, handle, type Deny, type HarnessAdapter, type Middleware } from "../src/index.ts";

const adapter = (id: string): HarnessAdapter => {
  const a = adapters.get(id);
  if (!a) throw new Error(`no adapter ${id}`);
  return a;
};

const load = (harness: string, event: string, name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(fixturesDir, harness, event, `${name}.json`), "utf8"));

const CONTEXT = "PROMPT-CONTEXT-TEXT";
const D: Deny = { reason: "PROMPT-DENY", hint: "PROMPT-HINT" };
const quiet = (): Pipeline => new Pipeline({ onFault: () => {} });
const withContext: Middleware = () => ({ context: CONTEXT });
const contextAndContinue: Middleware = () => ({ context: CONTEXT, continue: { reason: "go on" } });
const contextAndDeny: Middleware = () => ({ context: CONTEXT, deny: D });

describe("Claude UserPromptSubmit context", () => {
  const raw = load("claude", "UserPromptSubmit", "01-base");

  test("the default pipeline still answers {}", async () => {
    const { body } = await handle(adapter("claude"), raw, defaultPipeline());
    expect(body).toEqual({});
  });

  test("a layer returning context is encoded as additionalContext", async () => {
    const { body } = await handle(adapter("claude"), raw, quiet().use(withContext));
    expect(body).toEqual({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: CONTEXT } });
  });

  test("continue is not encoded on prompt-submit and context still is", async () => {
    const { body } = await handle(adapter("claude"), raw, quiet().use(contextAndContinue));
    expect(body).toEqual({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: CONTEXT } });
  });

  test("a deny on prompt-submit is not encoded and context is kept", async () => {
    const { body } = await handle(adapter("claude"), raw, quiet().use(contextAndDeny));
    expect(body).toEqual({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: CONTEXT } });
  });

  test("deny still wins over context on PreToolUse", async () => {
    const pre = load("claude", "PreToolUse", "01-write");
    const { body } = await handle(adapter("claude"), pre, quiet().use(contextAndDeny));
    expect(body).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "PROMPT-DENY\nPROMPT-HINT" },
    });
  });

  test("continue still wins on Stop", async () => {
    const stop = load("claude", "Stop", "01-base");
    const { body } = await handle(adapter("claude"), stop, quiet().use(contextAndContinue));
    expect(body).toEqual({ decision: "block", reason: "go on" });
  });
});

describe("other encoders are untouched", () => {
  test("Codex still encodes context on UserPromptSubmit", async () => {
    const { body } = await handle(adapter("codex"), load("codex", "UserPromptSubmit", "01-base"), quiet().use(withContext));
    expect(body).toEqual({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: CONTEXT } });
  });

  test("OpenCode carries context only on session.context", async () => {
    const onContext = await handle(adapter("opencode"), load("opencode", "session.context", "01-base"), quiet().use(withContext));
    expect(onContext.body).toEqual({ context: CONTEXT });
    const onPrompt = await handle(adapter("opencode"), load("opencode", "session.prompt", "01-steer"), quiet().use(withContext));
    expect(onPrompt.body).toEqual({});
  });
});

describe("Handled.reply", () => {
  const raw = load("claude", "PreToolUse", "01-write");

  test("equals the pipeline result on allow", async () => {
    const handled = await handle(adapter("claude"), raw, quiet().use(withContext));
    expect(handled.reply).toEqual({ context: CONTEXT });
  });

  test("is empty when nothing answers", async () => {
    const handled = await handle(adapter("claude"), raw, quiet());
    expect(handled.reply).toEqual({});
  });

  test("carries the deny on a deny", async () => {
    const handled = await handle(adapter("claude"), raw, quiet().use(() => ({ deny: D })));
    expect(handled.reply.deny).toEqual(D);
  });

  test("carries the fail-closed deny when decode throws under a deny-fault layer", async () => {
    const broken: HarnessAdapter = {
      ...adapter("claude"),
      decode: () => {
        throw new Error("decode broke");
      },
    };
    const p = quiet().use((_ctx, next) => next(), { onFault: { deny: D } });
    const handled = await handle(broken, raw, p, { onError: () => {} });
    expect(handled.reply).toEqual({ deny: D });
  });
});
