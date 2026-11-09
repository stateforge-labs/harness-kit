import { describe, expect, test } from "bun:test";
import { parseVersion } from "../../src/core/version.ts";

describe("parseVersion", () => {
  test("the first dotted version in the text", () => {
    expect(parseVersion("2.1.319 (Claude Code)")).toBe("2.1.319");
    expect(parseVersion("codex-cli 0.167.0")).toBe("0.167.0");
    expect(parseVersion("opencode v2.2.6")).toBe("2.2.6");
  });

  test("keeps a pre-release suffix", () => {
    expect(parseVersion("tool 1.2.3-beta.1 build")).toBe("1.2.3-beta.1");
  });

  test("no version is null", () => {
    expect(parseVersion("no digits here")).toBeNull();
  });
});
