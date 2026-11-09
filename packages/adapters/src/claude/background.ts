import { ClaudeTool } from "@stateforge-labs/harness-hooks";
import { num, str, type Row } from "../core/rows.ts";
import { ClaudeField, ClaudeQueueOperation, ClaudeResult, ClaudeTag } from "./constants.ts";
import type { ClaudeBlock, ClaudeRecord } from "./records.ts";
import { ClaudeTaskState } from "./enums.ts";

export interface ClaudeBackgroundTask {
  readonly toolUseId: string;
  readonly tool: string;
  readonly description: string | null;
  readonly startedAt: number | null;
  readonly expiresAfterMs: number | null;
}

export interface ClaudeBackgroundScan {
  readonly live: readonly ClaudeBackgroundTask[];
  readonly unseenEnd: boolean;
}

interface Launch {
  readonly task: ClaudeBackgroundTask;
  readonly agentTool: boolean;
  readonly tasks: Set<string>;
}

type Notice = "none" | "seen" | "unseen";

const NOTIFICATION_OPEN = `<${ClaudeTag.TaskNotification}>`;

const LAUNCHERS: readonly string[] = [ClaudeTool.Agent, ClaudeTool.Task, ClaudeTool.Monitor];

const launcherOf = (name: string): boolean => LAUNCHERS.includes(name);

function tagged(text: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(text);
  const value = match?.[1]?.trim() ?? "";
  return value === "" ? null : value;
}

function launchesOf(blocks: readonly ClaudeBlock[], startedAt: number | null): [string, Launch][] {
  return blocks.flatMap((block): [string, Launch][] => {
    if (block.kind !== "tool_use" || block.id === null) {
      return [];
    }
    const monitorTimeout = block.name === ClaudeTool.Monitor ? num(block.input[ClaudeField.TimeoutMs]) : null;
    if (block.input[ClaudeField.RunInBackground] !== true && !launcherOf(block.name)) {
      return [];
    }
    const described = str(block.input[ClaudeField.Description]);
    const description = described === null || described.trim() === "" ? null : described;
    const task: ClaudeBackgroundTask = { toolUseId: block.id, tool: block.name, description, startedAt, expiresAfterMs: monitorTimeout };
    const launch: Launch = { task, agentTool: block.name === ClaudeTool.Agent || block.name === ClaudeTool.Task, tasks: new Set<string>() };
    return [[block.id, launch]];
  });
}

function taskOf(result: Row, text: string): string | null {
  const words = ClaudeResult.IdWords.exec(text);
  return (
    str(result[ClaudeField.BackgroundTaskId]) ??
    str(result[ClaudeField.TaskId]) ??
    str(result[ClaudeField.AgentId]) ??
    words?.[1] ??
    words?.[2] ??
    null
  );
}

function asynchronous(result: Row, text: string): boolean {
  return result[ClaudeField.IsAsync] === true || result[ClaudeField.Status] === ClaudeResult.AsyncLaunched || text.startsWith(ClaudeResult.AsyncPrefix);
}

function endOf(tool: string | null, task: string | null, launches: Map<string, Launch>, closed: Set<string>): boolean {
  let ended = false;
  for (const [id, launch] of launches) {
    if (id !== tool && (task === null || !launch.tasks.has(task))) {
      continue;
    }
    launches.delete(id);
    closed.add(id);
    for (const own of launch.tasks) {
      closed.add(own);
    }
    ended = true;
  }
  return ended;
}

function notified(text: string, launches: Map<string, Launch>, closed: Set<string>): Notice {
  if (!text.trimStart().startsWith(NOTIFICATION_OPEN)) {
    return "none";
  }
  const task = tagged(text, ClaudeTag.TaskId);
  const tool = tagged(text, ClaudeTag.ToolUseId);
  const status = tagged(text, ClaudeTag.Status);
  if (status === null || !ClaudeTaskState.safeParse(status).success) {
    return "seen";
  }
  if (endOf(tool, task, launches, closed)) {
    return "seen";
  }
  return [tool, task].some((id) => id !== null && closed.has(id)) ? "seen" : "unseen";
}

function answered(record: Extract<ClaudeRecord, { kind: "user" }>, launches: Map<string, Launch>): void {
  for (const block of record.blocks) {
    if (block.kind !== "tool_result" || block.toolUseId === null) {
      continue;
    }
    const launch = launches.get(block.toolUseId);
    if (launch === undefined) {
      continue;
    }
    const task = taskOf(record.toolUseResult, block.text);
    if (task !== null) {
      launch.tasks.add(task);
    }
    if (launch.agentTool && !asynchronous(record.toolUseResult, block.text)) {
      launches.delete(block.toolUseId);
    }
  }
}

function newestOf(records: readonly ClaudeRecord[]): number | null {
  return records.reduce<number | null>((latest, record) => (record.at === null ? latest : Math.max(latest ?? record.at, record.at)), null);
}

export function scanClaudeBackground(records: readonly ClaudeRecord[]): ClaudeBackgroundScan {
  const launches = new Map<string, Launch>();
  const closed = new Set<string>();
  let unseenEnd = false;
  for (const record of records) {
    let notice: Notice = "none";
    if (record.kind === "assistant" && !record.sidechain) {
      for (const [id, launch] of launchesOf(record.blocks, record.at)) {
        launches.set(id, launch);
      }
    }
    if (record.kind === "queue-operation" && record.operation === ClaudeQueueOperation.Enqueue) {
      notice = notified(record.content, launches, closed);
    } else if (record.kind === "user") {
      notice = notified(record.text, launches, closed);
    }
    if (notice === "unseen") {
      unseenEnd = true;
    }
    if (notice === "none" && record.kind === "user") {
      answered(record, launches);
    }
  }
  const newest = newestOf(records);
  const live = [...launches.values()]
    .map((launch) => launch.task)
    .filter((task) => !(task.expiresAfterMs !== null && task.startedAt !== null && newest !== null && newest - task.startedAt > task.expiresAfterMs));
  return { live, unseenEnd };
}
