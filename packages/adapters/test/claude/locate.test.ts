import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claudeHome,
  claudeProjectsRoot,
  claudeSessionIdOfPid,
  listClaudeTranscripts,
  locateClaudeTranscript,
  transcriptHasCompactBoundary,
} from "../../src/claude/index.ts";
import type { AdapterEnv } from "../../src/env.ts";
import { adaptersFixtures } from "../support/fixtures.ts";
import { BACKGROUND, COMPACT, transcriptsRoot } from "./support.ts";

const BACKGROUND_ID = "00000000-0000-4000-8000-00000000008b";
const SESSION_ID = "00000000-0000-4000-8000-0000000001bd";

let tmp = "";
let root = "";

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "adapters-claude-locate-"));
  root = join(tmp, "projects");
  cpSync(transcriptsRoot, root, { recursive: true });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("claude home and projects root", () => {
  test("the home is the dot claude folder under the env home", () => {
    const env: AdapterEnv = { home: "/h", xdgDataHome: "/h/.local/share", xdgCacheHome: "/h/.cache", codexHome: "/h/.codex" };
    expect(claudeHome(env)).toBe("/h/.claude");
    expect(claudeProjectsRoot(env)).toBe("/h/.claude/projects");
  });
});

describe("locating a transcript", () => {
  test("a session id is found under its project folder", () => {
    const located = locateClaudeTranscript(BACKGROUND_ID, root);
    expect(located?.path).toBe(join(root, "-home-user-proj-6", `${BACKGROUND_ID}.jsonl`));
    expect(typeof located?.mtimeMs).toBe("number");
  });

  test("an unknown session id is null", () => {
    expect(locateClaudeTranscript("00000000-0000-4000-8000-0000000fffff", root)).toBeNull();
  });

  test("a missing root is null", () => {
    expect(locateClaudeTranscript(BACKGROUND_ID, join(tmp, "absent"))).toBeNull();
  });

  test("the newest copy wins when a session id appears in two project folders", () => {
    const copyDir = join(root, "-home-user-proj-copy");
    mkdirSync(copyDir, { recursive: true });
    const source = join(root, "-home-user-proj-6", `${BACKGROUND_ID}.jsonl`);
    const copy = join(copyDir, `${BACKGROUND_ID}.jsonl`);
    cpSync(source, copy);
    utimesSync(copy, new Date("2030-01-01T00:00:00Z"), new Date("2030-01-01T00:00:00Z"));
    expect(locateClaudeTranscript(BACKGROUND_ID, root)?.path).toBe(copy);
    rmSync(copyDir, { recursive: true, force: true });
  });
});

describe("listing transcripts", () => {
  test("seven top level transcripts, none under subagents", () => {
    const listed = listClaudeTranscripts(root);
    expect(listed).toHaveLength(7);
    expect(listed.some((path) => path.includes("subagents"))).toBe(false);
  });

  test("sinceMs drops a file older than the floor", () => {
    const old = join(root, "-home-user", `${"00000000-0000-4000-8000-00000000013b"}.jsonl`);
    utimesSync(old, new Date(1_000_000), new Date(1_000_000));
    const listed = listClaudeTranscripts(root, { sinceMs: 1_000_001 });
    expect(listed).toHaveLength(6);
    expect(listed).not.toContain(old);
    expect(listClaudeTranscripts(root)).toContain(old);
  });

  test("an empty or missing root lists nothing", () => {
    expect(listClaudeTranscripts(join(tmp, "absent"))).toEqual([]);
  });
});

describe("compact boundary scan", () => {
  test("a transcript with a compact boundary is detected", () => {
    expect(transcriptHasCompactBoundary(COMPACT)).toBe(true);
  });

  test("a transcript without one is not", () => {
    expect(transcriptHasCompactBoundary(BACKGROUND)).toBe(false);
  });

  test("a missing file is false", () => {
    expect(transcriptHasCompactBoundary(join(tmp, "absent.jsonl"))).toBe(false);
  });

  test("a boundary word straddling the one mebibyte chunk edge is found", () => {
    const chunk = 1_048_576;
    const needle = "compact_boundary";
    const straddle = join(tmp, "straddle.jsonl");
    for (const offset of [chunk - 5, chunk - 1, chunk - needle.length + 1]) {
      writeFileSync(straddle, `${"a".repeat(offset)}${needle}${"b".repeat(64)}`);
      expect(transcriptHasCompactBoundary(straddle)).toBe(true);
    }
    writeFileSync(straddle, `${"a".repeat(chunk + 10)}compact_boundar`);
    expect(transcriptHasCompactBoundary(straddle)).toBe(false);
  });
});

describe("sessions by pid", () => {
  test("the captured pid maps to its session id", () => {
    expect(claudeSessionIdOfPid(1986077, join(adaptersFixtures, "claude"))).toBe(SESSION_ID);
  });

  test("an unknown pid is null", () => {
    expect(claudeSessionIdOfPid(1, join(adaptersFixtures, "claude"))).toBeNull();
  });
});
