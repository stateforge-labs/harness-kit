import { describe, expect, test } from "bun:test";
import { inspectCodex } from "../../src/codex/inspect.ts";
import { EnvVar } from "../../src/env.ts";
import { fakeFs } from "../support/inspect-fs.ts";

describe("inspectCodex", () => {
  test("reports auth.json presence when config does not use the keyring", async () => {
    const fs = fakeFs({ files: ["/h/u/.codex/auth.json"], texts: { "/h/u/.codex/config.toml": 'model = "x"' } });
    const result = await inspectCodex({ env: { HOME: "/h/u" }, fs, platform: "linux" });
    expect(result).toMatchObject({ ok: true, value: { state: "known", loginStore: { present: true, file: "/h/u/.codex/auth.json" } } });
    expect(fs.reads).toEqual(["/h/u/.codex/config.toml"]);
  });

  test("a keyring store setting makes the state unknown", async () => {
    const fs = fakeFs({ texts: { "/h/u/.codex/config.toml": 'cli_auth_credentials_store = "keyring"' } });
    const result = await inspectCodex({ env: { HOME: "/h/u" }, fs, platform: "linux" });
    expect(result).toEqual({ ok: true, value: { state: "unknown", reason: "keyring-configured" } });
  });

  test("CODEX_HOME overrides the default base and ambient keys are listed", async () => {
    const fs = fakeFs();
    const result = await inspectCodex({ env: { HOME: "/h/u", [EnvVar.CodexHome]: "/cx", [EnvVar.CodexApiKey]: "k" }, fs, platform: "linux" });
    expect(result).toEqual({ ok: true, value: { state: "known", loginStore: { present: false, file: "/cx/auth.json" }, ambientKeys: [EnvVar.CodexApiKey] } });
  });

  test("a non-linux platform is unknown without reading config", async () => {
    const fs = fakeFs();
    const result = await inspectCodex({ env: { HOME: "/h/u" }, fs, platform: "darwin" });
    expect(result).toEqual({ ok: true, value: { state: "unknown", reason: "unsupported-platform" } });
    expect(fs.reads).toEqual([]);
  });
});
