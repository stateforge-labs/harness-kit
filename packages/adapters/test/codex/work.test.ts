import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRollout, type CodexRow } from "../../src/codex/rollout.ts";
import { openWork } from "../../src/codex/work.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const day = join(adaptersFixtures, "codex", "sessions", "2026", "11", "01");
const rolloutOf = (suffix: string): CodexRow[] => readRollout(readFileSync(join(day, `rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-${suffix}.jsonl`), "utf8").split("\n")).rows;

const row = (type: string, payload: Record<string, unknown>): string => JSON.stringify({ type, payload });
const TASK = row("event_msg", { type: "task_started" });
const call = (id: string, cell: string): string => row("response_item", { type: "function_call", name: "wait", call_id: id, arguments: JSON.stringify({ cell_id: cell }) });
const output = (id: string, text: string): string => row("response_item", { type: "function_call_output", call_id: id, output: text });
const running = (id: string, cell: string): string =>
  row("response_item", { type: "custom_tool_call_output", call_id: id, output: [{ type: "input_text", text: `Script running with cell ID ${cell}` }] });

describe("openWork on the captured rollouts", () => {
  test("a finished rollout has no open work", () => {
    expect(openWork(rolloutOf("0000000001fe"))).toMatchObject({ openCallIds: [], runningCells: [] });
  });

  test("one unanswered call stays open", () => {
    expect(openWork(rolloutOf("000000000244")).openCallIds).toEqual(["call_00000000000000000000000000000009"]);
  });

  test("a wait that never saw Script completed leaves its cell running", () => {
    expect(openWork(rolloutOf("000000000229")).runningCells).toEqual(["cell-1"]);
  });

  test("four calls and two running cells are reported in the busy rollout", () => {
    const work = openWork(rolloutOf("000000000255"));
    expect(work.openCallIds).toEqual([
      "call_00000000000000000000000000000012",
      "call_00000000000000000000000000000013",
      "call_00000000000000000000000000000016",
      "call_00000000000000000000000000000018",
    ]);
    expect(work.runningCells).toEqual(["cell-2", "cell-3"]);
    expect(work.turnStartedAt).not.toBeNull();
  });
});

describe("openWork on synthetic rows", () => {
  const parse = (lines: string[]): CodexRow[] => readRollout(lines).rows;

  test("only rows after the last task_started count", () => {
    const work = openWork(parse([row("response_item", { type: "function_call", name: "exec", call_id: "old" }), TASK, call("c1", "cell-9")]));
    expect(work.openCallIds).toEqual(["c1"]);
  });

  test("no task_started means the whole rollout is considered", () => {
    expect(openWork(parse([call("c1", "cell-9")])).openCallIds).toEqual(["c1"]);
    expect(openWork(parse([call("c1", "cell-9")])).turnStartedAt).toBeNull();
  });

  test("a wait answered with Script completed closes its cell", () => {
    const work = openWork(parse([TASK, running("r1", "cell-9"), call("c1", "cell-9"), output("c1", "Script completed")]));
    expect(work.runningCells).toEqual([]);
    expect(work.openCallIds).toEqual([]);
  });

  test("a wait answered without Script completed keeps its cell running", () => {
    const work = openWork(parse([TASK, running("r1", "cell-9"), call("c1", "cell-9"), output("c1", "still going")]));
    expect(work.runningCells).toEqual(["cell-9"]);
  });

  test("an answered call is no longer open", () => {
    expect(openWork(parse([TASK, call("c1", "cell-9"), output("c1", "ok")])).openCallIds).toEqual([]);
  });
});
