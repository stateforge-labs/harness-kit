import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Harness } from "@stateforge-labs/harness-hooks";
import {
  HARNESS_BINARY,
  compactCommand,
  harnessBinary,
  harnessOfTranscriptPath,
  sessionIdOfTranscriptPath,
  transcriptLocatorKey,
} from "../src/harness.ts";
import { adaptersFixtures } from "./support/fixtures.ts";

const claudeTranscript = join(adaptersFixtures, "claude", "projects", "-home-user-proj-2", "00000000-0000-4000-8000-000000000031.jsonl");
const claudeLayout = "/data/.claude/projects/-work-proj/00000000-0000-4000-8000-000000000031.jsonl";
const codexRollout = join(adaptersFixtures, "codex", "sessions", "2026", "11", "01", "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-0000000001fe.jsonl");
const CODEX_ID = "00000000-0000-4000-8000-0000000001fe";

describe("harnessBinary", () => {
  test("maps each harness to its CLI", () => {
    expect(harnessBinary(Harness.Claude)).toBe("claude");
    expect(harnessBinary(Harness.Codex)).toBe("codex");
    expect(harnessBinary(Harness.OpenCode)).toBe("opencode");
    expect(HARNESS_BINARY).toEqual({ claude: "claude", codex: "codex", opencode: "opencode" });
  });
});

describe("transcriptLocatorKey", () => {
  test("claude locates by session, codex and opencode by cwd", () => {
    expect(transcriptLocatorKey(Harness.Claude)).toBe("session");
    expect(transcriptLocatorKey(Harness.Codex)).toBe("cwd");
    expect(transcriptLocatorKey(Harness.OpenCode)).toBe("cwd");
  });
});

describe("harnessOfTranscriptPath", () => {
  test("recognises fixture transcripts of each harness", () => {
    expect(harnessOfTranscriptPath(claudeLayout)).toBe(Harness.Claude);
    expect(harnessOfTranscriptPath(codexRollout)).toBe(Harness.Codex);
    expect(harnessOfTranscriptPath("/data/opencode/opencode.db")).toBe(Harness.OpenCode);
    expect(harnessOfTranscriptPath("/data/opencode/opencode.db#ses_1")).toBe(Harness.OpenCode);
  });

  test("null for paths of no known harness", () => {
    expect(harnessOfTranscriptPath("/tmp/notes.jsonl")).toBeNull();
    expect(harnessOfTranscriptPath("/tmp/rollout-2026.jsonl")).toBeNull();
  });
});

describe("sessionIdOfTranscriptPath", () => {
  test("claude is the basename without .jsonl", () => {
    expect(sessionIdOfTranscriptPath(Harness.Claude, claudeTranscript)).toBe("00000000-0000-4000-8000-000000000031");
    expect(sessionIdOfTranscriptPath(Harness.Claude, "/x/.jsonl")).toBeNull();
    expect(sessionIdOfTranscriptPath(Harness.Claude, "/x/notes.txt")).toBeNull();
  });

  test("codex is the id in the rollout name", () => {
    expect(sessionIdOfTranscriptPath(Harness.Codex, codexRollout)).toBe(CODEX_ID);
  });

  test("opencode is the text after the last #", () => {
    expect(sessionIdOfTranscriptPath(Harness.OpenCode, "/d/opencode.db#ses_1")).toBe("ses_1");
    expect(sessionIdOfTranscriptPath(Harness.OpenCode, "/d/opencode.db")).toBeNull();
    expect(sessionIdOfTranscriptPath(Harness.OpenCode, "/d/opencode.db#")).toBeNull();
  });
});

describe("compactCommand", () => {
  test("table of compact commands", () => {
    expect(compactCommand(Harness.Claude)).toBe("/compact");
    expect(compactCommand(Harness.Claude, "keep the plan")).toBe("/compact keep the plan");
    expect(compactCommand(Harness.Claude, "   ")).toBe("/compact");
    expect(compactCommand(Harness.Codex)).toBe("/compact");
    expect(compactCommand(Harness.OpenCode)).toBe("/compact");
  });
});
