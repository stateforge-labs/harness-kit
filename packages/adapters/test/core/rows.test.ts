import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { arr, count, num, obj, parseRow, str, stamp } from "../../src/core/rows.ts";

const fixtures = join(import.meta.dir, "..", "..", "fixtures");

function jsonlUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return jsonlUnder(path);
    }
    return name.endsWith(".jsonl") ? [path] : [];
  });
}

describe("parseRow", () => {
  test("returns a plain object for a JSON object line", () => {
    expect(parseRow('{"type":"user","n":1}')).toEqual({ type: "user", n: 1 });
  });

  test("tolerates spaced JSON, which string prefilters miss", () => {
    expect(parseRow('{ "type" : "assistant" }')).toEqual({ type: "assistant" });
  });

  test("surrounding whitespace is ignored", () => {
    expect(parseRow('  {"a":true}\r\n')).toEqual({ a: true });
  });

  test("blank lines give null", () => {
    expect(parseRow("")).toBeNull();
    expect(parseRow("   \t")).toBeNull();
  });

  test("arrays and primitives give null", () => {
    expect(parseRow("[1,2]")).toBeNull();
    expect(parseRow("42")).toBeNull();
    expect(parseRow('"text"')).toBeNull();
    expect(parseRow("null")).toBeNull();
    expect(parseRow("true")).toBeNull();
  });

  test("invalid JSON gives null and never throws", () => {
    expect(parseRow('{"type":')).toBeNull();
    expect(parseRow("not json at all")).toBeNull();
  });

  test("every non-blank line of every masked jsonl fixture parses", () => {
    const files = jsonlUnder(fixtures);
    expect(files.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const file of files) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (line.trim() !== "" && parseRow(line) === null) {
          failures.push(file);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("tolerant accessors", () => {
  test("obj keeps objects and replaces everything else with an empty row", () => {
    expect(obj({ a: 1 })).toEqual({ a: 1 });
    expect(obj([1])).toEqual({});
    expect(obj("x")).toEqual({});
    expect(obj(null)).toEqual({});
    expect(obj(undefined)).toEqual({});
  });

  test("arr keeps only object elements", () => {
    expect(arr([{ a: 1 }, 2, null, [3], "s", { b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
    expect(arr({ a: 1 })).toEqual([]);
    expect(arr(undefined)).toEqual([]);
  });

  test("str accepts strings only", () => {
    expect(str("hi")).toBe("hi");
    expect(str("")).toBe("");
    expect(str(1)).toBeNull();
    expect(str(null)).toBeNull();
  });

  test("num accepts finite numbers only", () => {
    expect(num(0)).toBe(0);
    expect(num(-2.5)).toBe(-2.5);
    expect(num(Number.NaN)).toBeNull();
    expect(num(Number.POSITIVE_INFINITY)).toBeNull();
    expect(num("3")).toBeNull();
  });

  test("count is a finite number of at least zero, else zero", () => {
    expect(count(7)).toBe(7);
    expect(count(0)).toBe(0);
    expect(count(-1)).toBe(0);
    expect(count(Number.NaN)).toBe(0);
    expect(count("7")).toBe(0);
    expect(count(undefined)).toBe(0);
  });

  test("stamp reads ISO strings and epoch milliseconds", () => {
    expect(stamp("2026-11-01T00:00:00Z")).toBe(Date.parse("2026-11-01T00:00:00Z"));
    expect(stamp(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  test("stamp gives null for anything it cannot read as a time", () => {
    expect(stamp("not a date")).toBeNull();
    expect(stamp("")).toBeNull();
    expect(stamp(Number.NaN)).toBeNull();
    expect(stamp(null)).toBeNull();
    expect(stamp({})).toBeNull();
  });
});
