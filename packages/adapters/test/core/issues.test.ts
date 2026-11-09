import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { Unknown } from "../../src/constants.ts";
import { observeEnum, tallyUnknown, type Issue, type Parsed } from "../../src/core/issues.ts";

const Mode = z.enum(["default", "plan"]);
const site = { harness: "claude", record: "user", path: "permissionMode" } as const;

describe("observeEnum", () => {
  test("a known value comes back as the value, with no issue", () => {
    const issues: Issue[] = [];
    expect(observeEnum(Mode, "plan", site, issues)).toBe("plan");
    expect(issues).toEqual([]);
  });

  test("an unseen value gives null and one issue that names the options", () => {
    const issues: Issue[] = [];
    expect(observeEnum(Mode, "yolo", site, issues)).toBeNull();
    expect(issues).toEqual([
      { harness: "claude", record: "user", path: "permissionMode", got: "yolo", expected: "default|plan" },
    ]);
  });

  test("an absent value gives null with no issue", () => {
    const issues: Issue[] = [];
    expect(observeEnum(Mode, undefined, site, issues)).toBeNull();
    expect(observeEnum(Mode, null, site, issues)).toBeNull();
    expect(issues).toEqual([]);
  });

  test("a wrong JSON type is reported, not thrown", () => {
    const issues: Issue[] = [];
    expect(observeEnum(Mode, 3, site, issues)).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.got).toBe(3);
  });
});

describe("tallyUnknown", () => {
  test("counts unknown types, not-json lines and untyped rows, and ignores parsed records", () => {
    const parsed: Parsed<unknown>[] = [
      { ok: true, record: {}, issues: [] },
      { ok: false, reason: "unknown-type", type: "progress/bash", row: {} },
      { ok: false, reason: "unknown-type", type: "progress/bash", row: {} },
      { ok: false, reason: "unknown-type", type: null, row: {} },
      { ok: false, reason: "not-json", type: null, row: null },
    ];
    const { byType } = tallyUnknown(parsed);
    expect(Object.fromEntries(byType)).toEqual({
      "progress/bash": 2,
      [Unknown.Untyped]: 1,
      [Unknown.NotJson]: 1,
    });
  });

  test("no unknowns gives an empty map", () => {
    expect(tallyUnknown([{ ok: true, record: 1, issues: [] }]).byType.size).toBe(0);
  });
});
