import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CODEX_BINARY, CODEX_UNUSED_FEATURES, codexExec, codexVersionArgs, parseCodexVersion, readLastMessage } from "../../src/codex/exec.ts";
import { CodexFeature } from "../../src/codex/enums.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const headless = join(adaptersFixtures, "codex", "headless");
const help = readFileSync(join(headless, "help.txt"), "utf8");

describe("codexExec", () => {
  test("builds the exact read-only exec argv with the default feature disables", () => {
    const { program, args } = codexExec({ model: "gpt-5", effort: "high", outFile: "/tmp/last.md" });
    expect(program).toBe(CODEX_BINARY);
    expect(args).toEqual([
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--ignore-user-config",
      "-s",
      "read-only",
      "--color",
      "never",
      "-m",
      "gpt-5",
      "-c",
      "model_reasoning_effort=high",
      ...CODEX_UNUSED_FEATURES.flatMap((feature) => ["--disable", feature]),
      "-o",
      "/tmp/last.md",
      "-",
    ]);
  });

  test("omits model and effort when empty or null", () => {
    const { args } = codexExec({ model: "", effort: null, outFile: "/o", disableFeatures: [] });
    expect(args).toEqual(["exec", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "-s", "read-only", "--color", "never", "-o", "/o", "-"]);
  });

  test("every emitted flag appears in the captured codex exec help", () => {
    const { args } = codexExec({ model: "gpt-5", effort: "low", outFile: "/o" });
    for (const flag of args.filter((token) => token.startsWith("-") && token !== "-")) {
      expect(help).toContain(flag);
    }
  });

  test("default disabled features are exactly the captured unused set", () => {
    const captured = readFileSync(join(headless, "features.txt"), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.trim().split(/\s+/u)[0] ?? "");
    const received: string[] = [...CODEX_UNUSED_FEATURES].sort();
    expect(received).toEqual(captured.sort());
    expect([...CodexFeature.options]).toEqual([...CODEX_UNUSED_FEATURES]);
  });
});

describe("codexVersionArgs and parseCodexVersion", () => {
  test("version argv and parse of the captured output", () => {
    expect(codexVersionArgs()).toEqual(["--version"]);
    expect(parseCodexVersion(readFileSync(join(headless, "version.txt"), "utf8"))).toBe("0.167.0");
  });

  test("null when no version is present", () => {
    expect(parseCodexVersion("no version here")).toBeNull();
  });
});

describe("readLastMessage", () => {
  test("reads the captured last message", () => {
    expect(readLastMessage(join(headless, "codex-last.md"))).toBe("ok");
  });

  test("null for a missing file and for a blank file", () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-last-"));
    try {
      const blank = join(dir, "blank.md");
      writeFileSync(blank, "  \n");
      expect(readLastMessage(blank)).toBeNull();
      expect(readLastMessage(join(dir, "missing.md"))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
