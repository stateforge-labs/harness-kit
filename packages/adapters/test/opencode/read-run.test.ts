import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { opencodeTextOf, readOpencodeRun } from "../../src/opencode/engines/read-run.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const synthetic = join(adaptersFixtures, "opencode", "synthetic");
const stream = readFileSync(join(synthetic, "stream.jsonl"), "utf8");

describe("readOpencodeRun", () => {
  test("collects text, summed cost and session from the synthetic stream", () => {
    const reading = readOpencodeRun(stream);
    expect(reading.text).toBe("ok");
    expect(reading.cost).toBe(0.0012);
    expect(reading.sessionId).toBe("ses_00000000000000000000000002");
    expect(reading.error).toBeNull();
    expect(reading.unknownRows).toEqual([]);
  });

  test("reports no cost when no step finished", () => {
    expect(readOpencodeRun('{"type":"text","part":{"text":"a"}}').cost).toBeNull();
  });

  test("keeps the first error row", () => {
    const reading = readOpencodeRun('{"type":"error","error":{"message":"first"}}\n{"type":"error","error":{"message":"second"}}');
    expect(reading.error).toEqual({ message: "first" });
  });

  test("skips non-json lines and reports unknown types", () => {
    const reading = readOpencodeRun('garbage\n{"type":"mystery","x":1}\n');
    expect(reading.unknownRows).toEqual([{ type: "mystery", x: 1 }]);
    expect(reading.text).toBe("");
  });

  test("never throws on hostile input", () => {
    for (const out of ["", "{", "\u0000", "x".repeat(1_000_000)]) {
      expect(() => readOpencodeRun(out)).not.toThrow();
    }
  });

  test("does not depend on the store module", () => {
    const source = readFileSync(join(import.meta.dir, "..", "..", "src", "opencode", "engines", "read-run.ts"), "utf8");
    expect(source.includes("store.ts")).toBe(false);
  });
});

describe("opencodeTextOf", () => {
  test("returns the text of a text row", () => {
    expect(opencodeTextOf('{"type":"text","part":{"text":"hello"}}')).toBe("hello");
  });

  test("returns null for other rows and invalid lines", () => {
    expect(opencodeTextOf('{"type":"step_start"}')).toBeNull();
    expect(opencodeTextOf("{")).toBeNull();
    expect(opencodeTextOf("")).toBeNull();
  });
});
