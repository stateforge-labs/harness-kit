import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CodexRowType } from "../../src/codex/enums.ts";
import { codexRolloutRoot, findRolloutByCwd, isCompaction, isInjectedContext, listRollouts, parseRolloutRow, readRollout, rolloutMeta, sessionIdOfRolloutPath } from "../../src/codex/rollout.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const sessions = join(adaptersFixtures, "codex", "sessions");
const day = join(sessions, "2026", "11", "01");
const FIRST = "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-0000000001fe.jsonl";
const FIRST_ID = "00000000-0000-4000-8000-0000000001fe";
const NOW = Date.UTC(2026, 10, 1, 12);

const lines = (name: string): string[] => readFileSync(join(day, name), "utf8").split("\n");

describe("codexRolloutRoot", () => {
  test("joins the sessions folder under CODEX_HOME", () => {
    expect(codexRolloutRoot({ codexHome: "/x/codex" } as never)).toBe(join("/x/codex", "sessions"));
  });
});

describe("listRollouts", () => {
  test("finds every captured rollout in the day folder, newest first", () => {
    const found = listRollouts({ root: sessions, now: NOW, daysBack: 2 });
    expect(found.map((file) => file.path.split("/").pop()).sort()).toEqual(
      [
        FIRST,
        "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-00000000021e.jsonl",
        "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-000000000229.jsonl",
        "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-000000000244.jsonl",
        "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-000000000255.jsonl",
      ].sort(),
    );
  });

  test("respects the limit", () => {
    expect(listRollouts({ root: sessions, now: NOW, daysBack: 2, limit: 2 })).toHaveLength(2);
  });

  test("a missing root yields nothing", () => {
    expect(listRollouts({ root: join(sessions, "absent"), now: NOW })).toEqual([]);
  });
});

describe("rolloutMeta and sessionIdOfRolloutPath", () => {
  test("reads the session_meta header of the captured rollout", () => {
    const meta = rolloutMeta(join(day, FIRST));
    expect(meta?.sessionId).toBe(FIRST_ID);
    expect(meta?.cwd).not.toBeNull();
    expect(meta?.startedAt).not.toBeNull();
    expect(meta?.cliVersion).not.toBeNull();
  });

  test("a missing file has no meta", () => {
    expect(rolloutMeta(join(day, "missing.jsonl"))).toBeNull();
  });

  test("the session id is the trailing uuid of the file name", () => {
    expect(sessionIdOfRolloutPath(join(day, FIRST))).toBe(FIRST_ID);
    expect(sessionIdOfRolloutPath("/x/notes.jsonl")).toBeNull();
  });

  test("findRolloutByCwd returns the rollout whose header carries that cwd", () => {
    const cwd = rolloutMeta(join(day, FIRST))?.cwd ?? "";
    const found = findRolloutByCwd(cwd, { root: sessions, now: NOW, daysBack: 2 });
    expect(found?.path).toBe(join(day, FIRST));
    expect(findRolloutByCwd("/nowhere", { root: sessions, now: NOW, daysBack: 2 })).toBeNull();
  });
});

describe("readRollout on the captured rollouts", () => {
  test("every captured row parses with no unknown types", () => {
    for (const name of [FIRST, "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-00000000021e.jsonl", "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-000000000229.jsonl", "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-000000000244.jsonl", "rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-000000000255.jsonl"]) {
      const { rows, unknown } = readRollout(lines(name));
      expect(rows.length).toBeGreaterThan(0);
      expect(unknown.byType.size).toBe(0);
    }
  });

  test("the first rollout contains exactly one compaction", () => {
    const { rows } = readRollout(lines(FIRST));
    expect(rows.filter(isCompaction)).toHaveLength(1);
  });

  test("the first row is session_meta with the rollout's id", () => {
    const { rows } = readRollout(lines(FIRST));
    const first = rows[0];
    expect(first?.kind).toBe("session_meta");
    if (first?.kind === "session_meta") {
      expect(first.meta.sessionId).toBe(FIRST_ID);
    }
  });

  test("turn_context rows carry the model", () => {
    const { rows } = readRollout(lines(FIRST));
    const models = rows.flatMap((row) => (row.kind === "turn_context" ? [row.model] : []));
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model === "gpt-6-luna")).toBe(true);
  });
});

describe("parseRolloutRow", () => {
  test("a line that is not JSON is not-json", () => {
    expect(parseRolloutRow("{nope")).toMatchObject({ ok: false, reason: "not-json" });
  });

  test("a row type outside the enum is unknown-type", () => {
    expect(parseRolloutRow(JSON.stringify({ type: "brand_new_row", payload: {} }))).toMatchObject({ ok: false, reason: "unknown-type", type: "brand_new_row" });
  });

  test("an unknown item type is observed, not rejected", () => {
    const parsed = parseRolloutRow(JSON.stringify({ type: "response_item", payload: { type: "brand_new_item" } }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.issues).toHaveLength(1);
      expect(parsed.record.kind).toBe("response_item");
    }
  });

  test("a known row type that is not in the passthrough list is kept as passthrough", () => {
    const parsed = parseRolloutRow(JSON.stringify({ type: CodexRowType.parse("world_state"), payload: {} }));
    expect(parsed).toMatchObject({ ok: true, record: { kind: "passthrough", type: "world_state" } });
  });
});

describe("isInjectedContext", () => {
  test("recognises every plan prefix, after leading whitespace", () => {
    for (const head of ["<environment_context>", "<user_instructions>", "# AGENTS.md", "<user_shell_command>", "<recommended_plugins>", "<model_switch>"]) {
      expect(isInjectedContext(`  ${head} body`)).toBe(true);
    }
  });

  test("ordinary user text is not injected context", () => {
    expect(isInjectedContext("please fix the build")).toBe(false);
  });
});
