import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const pkg = join(import.meta.dir, "..", "..");
const ALLOWED = ["src/core/secret.ts", "src/driver/env-plan.ts"] as const;
const CALL = /\breveal\(/;

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourcesUnder(path);
    }
    return name.endsWith(".ts") ? [path] : [];
  });
}

describe("reveal is called only where the plan allows", () => {
  const callers = sourcesUnder(join(pkg, "src"))
    .filter((file) => CALL.test(readFileSync(file, "utf8")))
    .map((file) => file.slice(pkg.length + 1));

  test("every file that calls reveal( is on the allowed list", () => {
    for (const file of callers) {
      expect(ALLOWED as readonly string[]).toContain(file);
    }
  });

  test("secret.ts is the one source that declares reveal", () => {
    expect(callers).toContain("src/core/secret.ts");
  });
});
