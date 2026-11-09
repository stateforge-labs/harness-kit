import { describe, expect, test } from "bun:test";
import { ClaudeAttachmentKind, ClaudeCompactTrigger, ClaudeRecordKind, ClaudeSystemSubtype, ClaudeTaskState } from "../../src/claude/enums.ts";
import { ClaudeSubtype, ClaudeTaskStatus, ClaudeTrigger, ClaudeType } from "../../src/claude/constants.ts";

describe("claude enums", () => {
  test("record kinds cover every claude type constant", () => {
    expect([...ClaudeRecordKind.options].sort()).toEqual(Object.values(ClaudeType).sort());
  });

  test("system subtypes include every captured subtype constant", () => {
    for (const subtype of Object.values(ClaudeSubtype)) {
      expect(ClaudeSystemSubtype.safeParse(subtype).success).toBe(true);
    }
  });

  test("compact triggers and task states match their constants", () => {
    expect(ClaudeCompactTrigger.safeParse(ClaudeTrigger.Manual).success).toBe(true);
    expect(ClaudeCompactTrigger.safeParse(ClaudeTrigger.Auto).success).toBe(true);
    for (const status of Object.values(ClaudeTaskStatus)) {
      expect(ClaudeTaskState.safeParse(status).success).toBe(true);
    }
    expect(ClaudeTaskState.safeParse("exploded").success).toBe(false);
  });

  test("an unseen attachment kind is rejected", () => {
    expect(ClaudeAttachmentKind.safeParse("hologram").success).toBe(false);
  });
});
