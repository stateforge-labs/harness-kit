import { describe, expect, test } from "bun:test";
import { emulated, isUsable, supported, unmeasuredSupport, unsupported } from "../../src/core/capability.ts";
import { asSessionId } from "../../src/core/session.ts";

describe("capability support cells", () => {
  test("supported and emulated are usable", () => {
    expect(isUsable(supported)).toBe(true);
    expect(isUsable(emulated("prompt wrapper"))).toBe(true);
  });

  test("unsupported and unmeasured are not usable", () => {
    expect(isUsable(unsupported("harness-limit"))).toBe(false);
    expect(isUsable(unmeasuredSupport("does the flag exist?"))).toBe(false);
  });

  test("each constructor keeps its payload", () => {
    expect(supported).toEqual({ state: "supported" });
    expect(emulated("how")).toEqual({ state: "emulated", how: "how" });
    expect(unsupported("not-implemented")).toEqual({ state: "unsupported", reason: "not-implemented" });
    expect(unmeasuredSupport("q")).toEqual({ state: "unmeasured", question: "q" });
  });
});

describe("asSessionId", () => {
  test("an empty id is null", () => {
    expect(asSessionId("")).toBeNull();
  });

  test("a non-empty id is returned as given", () => {
    expect(asSessionId("abc-123") as string | null).toBe("abc-123");
  });
});
