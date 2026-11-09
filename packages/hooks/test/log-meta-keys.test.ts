import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { adapters } from "../src/index.ts";
import { fixturesDir } from "./fixtures-dir.ts";

const RESERVED = ["ts", "harness", "event", "keys", "known", "missing", "wrong_type"];
const COMMON = ["session_id", "agent_id", "agent_type", "tool_name"] as const;

const fixtureFiles = (harness: string): string[] =>
  readdirSync(join(fixturesDir, harness))
    .filter((event) => statSync(join(fixturesDir, harness, event)).isDirectory())
    .flatMap((event) =>
      readdirSync(join(fixturesDir, harness, event))
        .filter((f) => f.endsWith(".json") && !f.endsWith(".log.json") && !f.endsWith(".expected.json"))
        .map((f) => join(fixturesDir, harness, event, f)),
    );

const asLabel = (v: unknown): string | null => (typeof v === "string" ? v : null);

describe("a handler's meta never changes a field of the log line", () => {
  for (const harness of [...adapters.keys()]) {
    test(`${harness}: meta uses no reserved line field, and repeats a common field only with its value`, () => {
      const adapter = adapters.get(harness)!;
      const files = fixtureFiles(harness);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
        const meta = adapter.decode(raw).meta as Record<string, unknown>;
        const common = adapter.common(raw) as Record<string, unknown>;
        const reserved = Object.keys(meta).filter((k) => RESERVED.includes(k));
        const changed = COMMON.filter((k) => k in meta && meta[k] !== asLabel(common[k]));
        expect({ file, reserved, changed }).toEqual({ file, reserved: [], changed: [] });
      }
    });
  }
});
