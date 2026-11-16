import { describe, expect, test } from "bun:test";
import { CapabilityName, unsupported, UnsupportedReason } from "../../src/core/capability.ts";
import { OPENCODE_CAPABILITIES, OPENCODE_SDK_UNMEASURED } from "../../src/opencode/capabilities.ts";

describe("opencode structured output", () => {
  test("the cli cell is unsupported as not implemented", () => {
    expect(OPENCODE_CAPABILITIES[CapabilityName.StructuredOutput].cli).toEqual(unsupported(UnsupportedReason.NotImplemented));
  });

  test("the sdk cell keeps its open question", () => {
    expect(OPENCODE_CAPABILITIES[CapabilityName.StructuredOutput].sdk).toEqual(OPENCODE_SDK_UNMEASURED);
  });
});
