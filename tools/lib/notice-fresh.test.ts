import { describe, expect, test } from "bun:test";
import { noticeIsFresh } from "./notice-fresh.ts";

const NOW = Date.parse("2026-11-09T00:00:00Z");

describe("noticeIsFresh", () => {
  test("a notice retrieved today is fresh", () => {
    expect(noticeIsFresh("2026-11-09", NOW)).toBe(true);
  });

  test("exactly 30 days old is still fresh", () => {
    expect(noticeIsFresh("2026-10-10", NOW)).toBe(true);
  });

  test("31 days old is not fresh", () => {
    expect(noticeIsFresh("2026-10-09", NOW)).toBe(false);
  });

  test("malformed dates are not fresh", () => {
    for (const value of ["", "2026-1-9", "09-11-2026", "not a date", "2026-11-09T00:00:00Z"]) {
      expect(noticeIsFresh(value, NOW)).toBe(false);
    }
  });

  test("an impossible calendar date is not fresh", () => {
    expect(noticeIsFresh("2026-02-30", NOW)).toBe(false);
  });
});
