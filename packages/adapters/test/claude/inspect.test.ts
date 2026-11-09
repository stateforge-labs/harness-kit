import { describe, expect, test } from "bun:test";
import { inspectClaude } from "../../src/claude/inspect.ts";
import { EnvVar } from "../../src/env.ts";
import { fakeFs } from "../support/inspect-fs.ts";

describe("inspectClaude", () => {
  test("reports the default credentials file and ambient keys without reading a keyring file", async () => {
    const fs = fakeFs({ files: ["/h/u/.claude/.credentials.json"] });
    const result = await inspectClaude({ env: { HOME: "/h/u", [EnvVar.AnthropicApiKey]: "x" }, fs, platform: "linux" });
    expect(result).toEqual({ ok: true, value: { state: "known", loginStore: { present: true, file: "/h/u/.claude/.credentials.json" }, ambientKeys: [EnvVar.AnthropicApiKey] } });
    expect(fs.reads).toEqual([]);
  });

  test("CLAUDE_CONFIG_DIR overrides the default base", async () => {
    const fs = fakeFs();
    const result = await inspectClaude({ env: { HOME: "/h/u", [EnvVar.ClaudeConfigDir]: "/cfg" }, fs, platform: "linux" });
    expect(result).toMatchObject({ ok: true, value: { state: "known", loginStore: { present: false, file: "/cfg/.credentials.json" } } });
  });

  test("a non-linux platform is unknown", async () => {
    const result = await inspectClaude({ env: { HOME: "/h/u" }, fs: fakeFs(), platform: "darwin" });
    expect(result).toEqual({ ok: true, value: { state: "unknown", reason: "unsupported-platform" } });
  });

  test("an unset HOME is a failure", async () => {
    const result = await inspectClaude({ env: {}, fs: fakeFs(), platform: "linux" });
    expect(result.ok).toBe(false);
  });
});
