import { describe, expect, test } from "bun:test";
import { argvBytes, envBytes, LINUX_ARGV_EVIDENCE, LINUX_MAX_ARG_BYTES, LINUX_MAX_ARGV_BYTES, longestArgBytes } from "../../src/core/limits.ts";

describe("argument and environment budgets", () => {
  test("argv bytes add one terminator per argument", () => {
    expect(argvBytes(["a", "bc"])).toBe(5);
    expect(argvBytes([])).toBe(0);
  });

  test("multibyte characters count their UTF-8 bytes", () => {
    expect(argvBytes(["é"])).toBe(3);
    expect(longestArgBytes(["é", "abc"])).toBe(3);
  });

  test("the longest argument is measured in bytes", () => {
    expect(longestArgBytes(["a", "bcd", ""])).toBe(3);
    expect(longestArgBytes([])).toBe(0);
  });

  test("environment bytes add key, value and two separators", () => {
    expect(envBytes({ A: "bc" })).toBe(5);
    expect(envBytes({})).toBe(0);
  });

  test("the measured Linux limits and their probe evidence", () => {
    expect(LINUX_MAX_ARGV_BYTES).toBe(2_097_152);
    expect(LINUX_MAX_ARG_BYTES).toBe(131_071);
    expect(LINUX_ARGV_EVIDENCE).toEqual({ kind: "probe", ref: "probe of the Linux execve argument limits", harnessVersion: null, capturedAt: "2026-11-09" });
  });
});
