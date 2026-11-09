import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = join(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")) as {
  exports: Record<string, { bun: string; types: string; default: string }>;
};

describe("the exports map", () => {
  const entries = Object.entries(manifest.exports);

  test("every subpath has a source file for the bun condition", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [, target] of entries) expect(existsSync(join(pkg, target.bun))).toBe(true);
  });

  test("the default condition points into dist/ and mirrors the source file", () => {
    for (const [, target] of entries) {
      expect(target.default.startsWith("./dist/")).toBe(true);
      expect(target.default).toBe(target.bun.replace("./src/", "./dist/src/").replace(/\.ts$/, ".js"));
    }
  });

  test("every type condition points into dist/", () => {
    for (const [, target] of entries) expect(target.types.startsWith("./dist/")).toBe(true);
  });
});
