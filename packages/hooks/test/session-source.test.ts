import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixturesDir } from "./fixtures-dir.ts";
import { Kind, Pipeline, adapters, handle, type HarnessAdapter, type HookContext, type NeutralEvent } from "../src/index.ts";

const SOURCES = ["startup", "resume", "clear", "compact", "fork"] as const;

const adapter = (id: string): HarnessAdapter => {
  const a = adapters.get(id);
  if (!a) throw new Error(`no adapter ${id}`);
  return a;
};

const load = (harness: string, event: string, name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(fixturesDir, harness, event, `${name}.json`), "utf8"));

const seen = async (harness: string, raw: Record<string, unknown>): Promise<NeutralEvent | undefined> => {
  let event: NeutralEvent | undefined;
  const pipeline = new Pipeline({ onFault: () => {} }).use((ctx: HookContext, next) => {
    event = ctx.event;
    return next();
  });
  await handle(adapter(harness), raw, pipeline);
  return event;
};

describe.each([
  ["claude", "01-startup"],
  ["codex", "01-startup"],
])("%s SessionStart source", (harness, base) => {
  test.each([...SOURCES])("source %s reaches the neutral event", async (source) => {
    const raw = { ...load(harness, "SessionStart", base), source };
    const decoded = adapter(harness).decode(raw);
    expect(decoded.event?.kind).toBe(Kind.SessionStart);
    expect(decoded.event?.source).toBe(source);
    expect(decoded.wrong_type).toEqual([]);
    expect((await seen(harness, raw))?.source).toBe(source);
  });

  test("a source outside the set is left off the event and reported as wrong_type", () => {
    const decoded = adapter(harness).decode({ ...load(harness, "SessionStart", base), source: "reboot" });
    expect(decoded.event?.kind).toBe(Kind.SessionStart);
    expect(decoded.event).not.toHaveProperty("source");
    expect(decoded.wrong_type.some((w) => w.startsWith("source:"))).toBe(true);
  });

  test("a missing source is left off the event and reported as missing", () => {
    const { source: _source, ...raw } = load(harness, "SessionStart", base);
    const decoded = adapter(harness).decode(raw);
    expect(decoded.event).not.toHaveProperty("source");
    expect(decoded.missing).toContain("source");
  });
});

describe("captured SessionStart fixtures", () => {
  test.each([
    ["claude", "01-startup", "startup"],
    ["claude", "02-resume", "resume"],
    ["claude", "03-clear", "clear"],
    ["codex", "01-startup", "startup"],
    ["codex", "02-compact", "compact"],
  ])("%s %s decodes source %s", (harness, name, source) => {
    expect(adapter(harness).decode(load(harness, "SessionStart", name)).event?.source).toBe(source as NeutralEvent["source"]);
  });
});

describe("source is set on session-start only", () => {
  test("a Claude ConfigChange keeps its own source field off the event", () => {
    const raw = load("claude", "ConfigChange", "01-local-settings");
    expect(raw.source).toBe("local_settings");
    expect(adapter("claude").decode(raw).event).not.toHaveProperty("source");
  });

  test("a Claude SessionEnd carrying a session source value has no source on the event", () => {
    const decoded = adapter("claude").decode({ ...load("claude", "SessionEnd", "01-base"), source: "startup" });
    expect(decoded.event?.kind).toBe(Kind.SessionEnd);
    expect(decoded.event).not.toHaveProperty("source");
  });

  test("an OpenCode session-start has no source on the event", () => {
    const decoded = adapter("opencode").decode({ ...load("opencode", "session.context", "01-base"), source: "startup" });
    expect(decoded.event?.kind).toBe(Kind.SessionStart);
    expect(decoded.event).not.toHaveProperty("source");
  });
});
