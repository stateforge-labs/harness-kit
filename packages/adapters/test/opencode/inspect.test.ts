import { describe, expect, test } from "bun:test";
import { inspectOpencode } from "../../src/opencode/inspect.ts";
import { EnvVar } from "../../src/env.ts";
import { fakeFs } from "../support/inspect-fs.ts";

describe("inspectOpencode", () => {
  test("reports the default XDG data auth file", async () => {
    const fs = fakeFs({ files: ["/h/u/.local/share/opencode/auth.json"] });
    const result = await inspectOpencode({ env: { HOME: "/h/u" }, fs, platform: "linux" });
    expect(result).toEqual({ ok: true, value: { state: "known", loginStore: { present: true, file: "/h/u/.local/share/opencode/auth.json" }, ambientKeys: [] } });
    expect(fs.reads).toEqual([]);
  });

  test("XDG_DATA_HOME overrides the base and ambient keys are listed", async () => {
    const fs = fakeFs();
    const result = await inspectOpencode({ env: { HOME: "/h/u", [EnvVar.XdgDataHome]: "/xdg", [EnvVar.OpenAiApiKey]: "k" }, fs, platform: "linux" });
    expect(result).toEqual({ ok: true, value: { state: "known", loginStore: { present: false, file: "/xdg/opencode/auth.json" }, ambientKeys: [EnvVar.OpenAiApiKey] } });
  });

  test("a non-linux platform is unknown", async () => {
    const result = await inspectOpencode({ env: { HOME: "/h/u" }, fs: fakeFs(), platform: "darwin" });
    expect(result).toEqual({ ok: true, value: { state: "unknown", reason: "unsupported-platform" } });
  });
});
