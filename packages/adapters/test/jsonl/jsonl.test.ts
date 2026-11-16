import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { growTail, parseRow, readJsonl, readLines, rowOf, rowsOf, tailLines, tailOf, textOf, type Tail, type TailReader } from "../../src/jsonl/index.ts";

let dir: string;
const file = (name: string, text: string): string => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "harness-adapters-jsonl-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readLines", () => {
  test("returns the whole lines inside the budget and the offset after the last newline", () => {
    const path = file("lines.jsonl", "aa\nbb\ncc");
    expect(readLines(path, 0, 100)).toEqual({ lines: ["aa", "bb"], end: 6 });
    expect(readLines(path, 3, 4)).toEqual({ lines: ["bb"], end: 6 });
  });

  test("a window with no newline reads nothing and keeps the start offset", () => {
    const path = file("partial.jsonl", "aaaa\n");
    expect(readLines(path, 0, 3)).toEqual({ lines: [], end: 0 });
  });

  test("a missing file throws", () => {
    expect(() => readLines(join(dir, "missing.jsonl"), 0, 10)).toThrow();
  });
});

describe("tailOf and tailLines", () => {
  test("a file inside the budget is read whole and is not truncated", () => {
    const path = file("small.jsonl", "a\nb\n");
    expect(tailOf(path, 100)).toEqual({ lines: ["a", "b"], truncated: false });
    expect(tailLines(path, 100)).toEqual(["a", "b"]);
  });

  test("a file over the budget reads the last budget bytes up to the last newline and is truncated", () => {
    const path = file("big.jsonl", "first\nsecond\nthird\n");
    expect(tailOf(path, 8)).toEqual({ lines: ["d", "third"], truncated: true });
    expect(tailOf(path, 13)).toEqual({ lines: ["second", "third"], truncated: true });
  });

  test("a missing file throws", () => {
    expect(() => tailOf(join(dir, "missing.jsonl"), 10)).toThrow();
  });
});

describe("readJsonl", () => {
  test("reads from the cursor, moves the cursor past the last whole line and reports growth", () => {
    const path = file("cursor.jsonl", "a\nb\nc\n");
    expect(readJsonl(path, 0, 100)).toEqual({ lines: ["a", "b", "c"], cursor: 6, grew: true });
    expect(readJsonl(path, 2, 100)).toEqual({ lines: ["b", "c"], cursor: 6, grew: true });
    expect(readJsonl(path, 6, 100)).toEqual({ lines: [], cursor: 6, grew: false });
  });

  test("a cursor further back than the budget starts at size minus budget", () => {
    const path = file("budget.jsonl", "aaaa\nbbbb\ncccc\n");
    expect(readJsonl(path, 0, 5)).toEqual({ lines: ["cccc"], cursor: 15, grew: true });
  });
});

describe("growTail", () => {
  const fakeFile = (size: number, asked: number[]): TailReader => (path, budgetBytes) => {
    asked.push(budgetBytes);
    return { lines: [`${path}:${budgetBytes}`], truncated: size > budgetBytes };
  };

  test("starts at the larger of the budget and the initial bytes and doubles while the scan wants more", () => {
    const asked: number[] = [];
    const grown = growTail("/f", 1, { initialBytes: 2, maxBytes: 64, scan: (t: Tail) => t.lines[0], wantsMore: () => true, read: fakeFile(20, asked) });
    expect(asked).toEqual([2, 4, 8, 16, 32]);
    expect(grown).toEqual({ scan: "/f:32", tail: { lines: ["/f:32"], truncated: false }, bytes: 32 });
  });

  test("stops at the maximum even when the tail is still truncated", () => {
    const asked: number[] = [];
    const grown = growTail("/f", 3, { initialBytes: 0, maxBytes: 10, scan: () => null, wantsMore: () => true, read: fakeFile(100, asked) });
    expect(asked).toEqual([3, 6, 10]);
    expect(grown.bytes).toBe(10);
    expect(grown.tail.truncated).toBe(true);
  });

  test("stops as soon as the scan wants no more", () => {
    const asked: number[] = [];
    const grown = growTail("/f", 4, { initialBytes: 0, maxBytes: 1024, scan: (t: Tail) => t.lines[0] === "/f:8", wantsMore: (done: boolean) => !done, read: fakeFile(1000, asked) });
    expect(asked).toEqual([4, 8]);
    expect(grown.scan).toBe(true);
  });

  test("a tail that is not truncated is read once", () => {
    const asked: number[] = [];
    growTail("/f", 50, { initialBytes: 0, maxBytes: 1024, scan: () => 0, wantsMore: () => true, read: fakeFile(10, asked) });
    expect(asked).toEqual([50]);
  });

  test("reads the file with tailOf when no reader is given, and a reader error is not caught", () => {
    const path = file("grow.jsonl", "one\ntwo\nthree\n");
    const grown = growTail(path, 6, { initialBytes: 0, maxBytes: 64, scan: (t: Tail) => t.lines[0], wantsMore: (first: string | undefined) => first !== "one" });
    expect(grown.bytes).toBe(24);
    expect(grown.tail).toEqual({ lines: ["one", "two", "three"], truncated: false });
    expect(() => growTail(join(dir, "missing.jsonl"), 6, { initialBytes: 0, maxBytes: 64, scan: () => 0, wantsMore: () => true })).toThrow();
  });
});

describe("row helpers", () => {
  test("parseRow returns a parsed object and null for anything that is not JSON or not an object", () => {
    expect(parseRow('{"a":1}')).toEqual({ a: 1 });
    expect(parseRow("[1,2]")).toEqual([1, 2] as never);
    expect(parseRow("not json")).toBeNull();
    expect(parseRow("")).toBeNull();
    expect(parseRow("3")).toBeNull();
    expect(parseRow("null")).toBeNull();
  });

  test("rowOf keeps a plain object and turns anything else into an empty row", () => {
    expect(rowOf({ a: 1 })).toEqual({ a: 1 });
    expect(rowOf([1])).toEqual({});
    expect(rowOf(null)).toEqual({});
    expect(rowOf("x")).toEqual({});
  });

  test("rowsOf maps every item of an array to a row and returns no rows for a non-array", () => {
    expect(rowsOf([{ a: 1 }, 2, null])).toEqual([{ a: 1 }, {}, {}]);
    expect(rowsOf({ a: 1 })).toEqual([]);
  });

  test("textOf returns a non-empty string and null otherwise", () => {
    expect(textOf("x")).toBe("x");
    expect(textOf("")).toBeNull();
    expect(textOf(1)).toBeNull();
  });
});
