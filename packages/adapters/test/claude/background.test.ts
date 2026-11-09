import { describe, expect, test } from "bun:test";
import { readClaudeRecords, scanClaudeBackground } from "../../src/claude/index.ts";
import { BACKGROUND, linesOf, respaced } from "./support.ts";

const line = (value: unknown): string => JSON.stringify(value);
const scanLines = (lines: readonly string[]) => scanClaudeBackground(readClaudeRecords(lines).records);

const launch = (at: string, id: string, name: string, input: Record<string, unknown>): string =>
  line({ type: "assistant", timestamp: at, message: { content: [{ type: "tool_use", id, name, input }] } });

const result = (at: string, toolUseId: string, text: string, extra: Record<string, unknown> = {}): string =>
  line({
    type: "user",
    timestamp: at,
    message: { content: [{ type: "tool_result", tool_use_id: toolUseId, content: text }] },
    toolUseResult: extra,
  });

const notice = (at: string, toolUseId: string, status = "completed"): string =>
  line({
    type: "user",
    timestamp: at,
    message: {
      content: `<task-notification>\n<task-id>bg1</task-id>\n<tool-use-id>${toolUseId}</tool-use-id>\n<status>${status}</status>\n</task-notification>`,
    },
  });

const quiet = (at: string): string => line({ type: "user", timestamp: at, message: { content: "still here" } });

describe("background scan on the captured transcript", () => {
  test("the live agent is reported and the unmatched end is unseen", () => {
    const scan = scanLines(linesOf(BACKGROUND));
    expect(scan.live.map((task) => [task.tool, task.description])).toEqual([["Agent", "amet aliqua eiusmod in"]]);
    expect(scan.unseenEnd).toBe(true);
  });

  test("a tail that starts after the launch has no live work but an unseen end", () => {
    const scan = scanLines(linesOf(BACKGROUND).slice(74));
    expect(scan.live).toEqual([]);
    expect(scan.unseenEnd).toBe(true);
  });

  test("the spaced json variant gives identical results", () => {
    const original = scanLines(linesOf(BACKGROUND));
    const variant = scanLines(respaced(linesOf(BACKGROUND)));
    expect(variant).toEqual(original);
  });
});

describe("background scan on synthetic transcripts", () => {
  test("an inline background bash run closed by its notice leaves nothing live or unseen", () => {
    const scan = scanLines([
      launch("2026-11-01T10:00:00Z", "toolu_bash", "Bash", { command: "sleep 5", run_in_background: true, description: "wait" }),
      notice("2026-11-01T10:00:05Z", "toolu_bash"),
    ]);
    expect(scan).toEqual({ live: [], unseenEnd: false });
  });

  test("an open inline background bash run is live", () => {
    const scan = scanLines([launch("2026-11-01T10:00:00Z", "toolu_bash", "Bash", { command: "sleep 5", run_in_background: true, description: "wait" })]);
    expect(scan.live.map((task) => [task.toolUseId, task.tool, task.description])).toEqual([["toolu_bash", "Bash", "wait"]]);
  });

  test("a monitor with a timeout expires once the transcript runs past it", () => {
    const open = scanLines([
      launch("2026-11-01T10:00:00Z", "toolu_mon", "Monitor", { command: "tail -f log", timeout_ms: 60000, description: "watch" }),
      quiet("2026-11-01T10:00:30Z"),
    ]);
    expect(open.live.map((task) => task.toolUseId)).toEqual(["toolu_mon"]);
    const expired = scanLines([
      launch("2026-11-01T10:00:00Z", "toolu_mon", "Monitor", { command: "tail -f log", timeout_ms: 60000, description: "watch" }),
      quiet("2026-11-01T10:05:00Z"),
    ]);
    expect(expired.live).toEqual([]);
  });

  test("a synchronous agent result removes the launch", () => {
    const scan = scanLines([
      launch("2026-11-01T10:00:00Z", "toolu_agent", "Agent", { description: "look", prompt: "x" }),
      result("2026-11-01T10:01:00Z", "toolu_agent", "done", { status: "completed" }),
    ]);
    expect(scan.live).toEqual([]);
  });

  test("an async agent result stays live until its notice arrives", () => {
    const launched = [
      launch("2026-11-01T10:00:00Z", "toolu_agent", "Agent", { description: "look", prompt: "x" }),
      result("2026-11-01T10:00:01Z", "toolu_agent", "Async agent launched successfully.\nagentId: ag1", { status: "async_launched", agentId: "ag1" }),
    ];
    expect(scanLines(launched).live.map((task) => task.toolUseId)).toEqual(["toolu_agent"]);
    expect(scanLines([...launched, notice("2026-11-01T10:02:00Z", "toolu_agent")])).toEqual({ live: [], unseenEnd: false });
  });

  test("a notice for an unknown tool use is an unseen end", () => {
    expect(scanLines([notice("2026-11-01T10:00:00Z", "toolu_ghost", "failed")]).unseenEnd).toBe(true);
  });

  test("a notice with an unrecognised status is seen, not unseen", () => {
    expect(scanLines([notice("2026-11-01T10:00:00Z", "toolu_ghost", "weird")]).unseenEnd).toBe(false);
  });
});
