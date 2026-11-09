import { closeSync, openSync, readdirSync, readSync } from "node:fs";
import { basename, join } from "node:path";
import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { statFiles, newestFirst, type Stamped } from "../core/fs.ts";
import { tallyUnknown, observeEnum, type Issue, type Parsed, type Site, type Unknowns } from "../core/issues.ts";
import { obj, parseRow, stamp, str, type Row } from "../core/rows.ts";
import { adapterEnv, type AdapterEnv } from "../env.ts";
import { CodexDir, CodexField, CodexInjected, CodexItem, CodexScan, CodexType } from "./constants.ts";
import { CodexEventType, CodexItemType, CodexRole, CodexRowType } from "./enums.ts";

const HARNESS: HarnessId = Harness.Codex;
const ROLLOUT_SUFFIX = ".jsonl";
const ROLLOUT_NAME = /^rollout-.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

export const CODEX_INJECTED_PREFIXES: readonly string[] = CodexInjected.Prefixes;

export function codexRolloutRoot(env: AdapterEnv = adapterEnv()): string {
  return join(env.codexHome, CodexDir.Sessions);
}

export type RolloutFile = Stamped;

export interface RolloutQuery {
  readonly root: string;
  readonly daysBack?: number;
  readonly limit?: number;
  readonly now?: number;
}

export interface RolloutMeta {
  readonly sessionId: string | null;
  readonly cwd: string | null;
  readonly startedAt: number | null;
  readonly cliVersion: string | null;
}

export interface CodexBase {
  readonly row: Row;
  readonly at: number | null;
}

export type CodexRow =
  | (CodexBase & { readonly kind: "session_meta"; readonly meta: RolloutMeta })
  | (CodexBase & { readonly kind: "turn_context"; readonly model: string | null })
  | (CodexBase & { readonly kind: "event_msg"; readonly event: string | null; readonly payload: Row })
  | (CodexBase & { readonly kind: "response_item"; readonly item: string | null; readonly payload: Row })
  | (CodexBase & { readonly kind: "compacted"; readonly payload: Row })
  | (CodexBase & { readonly kind: "passthrough"; readonly type: string });

export type CodexEventRow = Extract<CodexRow, { readonly kind: "event_msg" }>;

function dayDir(root: string, now: number, back: number): string {
  const day = new Date(now - back * CodexScan.DayMs);
  return join(root, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, "0"), String(day.getDate()).padStart(2, "0"));
}

function rolloutsIn(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(ROLLOUT_SUFFIX))
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

export function listRollouts(query: RolloutQuery): RolloutFile[] {
  const now = query.now ?? Date.now();
  const daysBack = query.daysBack ?? CodexScan.DaysBack;
  const found: string[] = [];
  for (let back = 0; back < daysBack; back++) {
    found.push(...rolloutsIn(dayDir(query.root, now, back)));
  }
  return newestFirst(statFiles(found)).slice(0, query.limit ?? CodexScan.Candidates);
}

function firstLine(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(CodexScan.HeadBytes);
    const read = readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.toString("utf8", 0, read).split("\n", 1)[0] ?? "";
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

function metaOf(row: Row): RolloutMeta {
  const payload = obj(row[CodexField.Payload]);
  return {
    sessionId: str(payload[CodexField.Id]),
    cwd: str(payload[CodexField.Cwd]),
    startedAt: stamp(payload[CodexField.Timestamp]),
    cliVersion: str(payload[CodexField.CliVersion]),
  };
}

export function rolloutMeta(path: string): RolloutMeta | null {
  const line = firstLine(path);
  const row = line === null ? null : parseRow(line);
  if (row === null || row[CodexField.Type] !== CodexType.SessionMeta) {
    return null;
  }
  return metaOf(row);
}

export function findRolloutByCwd(cwd: string, query: RolloutQuery): RolloutFile | null {
  for (const file of listRollouts(query)) {
    if (rolloutMeta(file.path)?.cwd === cwd) {
      return file;
    }
  }
  return null;
}

export function sessionIdOfRolloutPath(path: string): string | null {
  return ROLLOUT_NAME.exec(basename(path))?.[1] ?? null;
}

export function isCompaction(row: CodexRow): boolean {
  return row.kind === "compacted";
}

export function isInjectedContext(text: string): boolean {
  const head = text.trimStart();
  return CODEX_INJECTED_PREFIXES.some((prefix) => head.startsWith(prefix));
}

function build(type: CodexRowType, base: CodexBase, row: Row, issues: Issue[]): CodexRow {
  const site = (path: string): Site => ({ harness: HARNESS, record: type, path });
  const payload = obj(row[CodexField.Payload]);
  if (type === CodexType.SessionMeta) {
    return { ...base, kind: "session_meta", meta: metaOf(row) };
  }
  if (type === CodexType.TurnContext) {
    return { ...base, kind: "turn_context", model: str(payload[CodexField.Model]) };
  }
  if (type === CodexType.EventMsg) {
    const event = str(payload[CodexField.Type]);
    observeEnum(CodexEventType, event ?? undefined, site("payload.type"), issues);
    return { ...base, kind: "event_msg", event, payload };
  }
  if (type === CodexType.ResponseItem) {
    const item = str(payload[CodexField.Type]);
    observeEnum(CodexItemType, item ?? undefined, site("payload.type"), issues);
    if (item === CodexItem.Message) {
      observeEnum(CodexRole, str(payload[CodexField.Role]) ?? undefined, site("payload.role"), issues);
    }
    return { ...base, kind: "response_item", item, payload };
  }
  if (type === CodexType.Compacted) {
    return { ...base, kind: "compacted", payload };
  }
  return { ...base, kind: "passthrough", type };
}

export function parseRolloutRow(line: string): Parsed<CodexRow> {
  const row = parseRow(line);
  if (row === null) {
    return { ok: false, reason: "not-json", type: null, row: null };
  }
  const type = str(row[CodexField.Type]);
  if (type === null || !CodexRowType.safeParse(type).success) {
    return { ok: false, reason: "unknown-type", type, row };
  }
  const issues: Issue[] = [];
  const record = build(CodexRowType.parse(type), { row, at: stamp(row[CodexField.Timestamp]) }, row, issues);
  return { ok: true, record, issues };
}

export function readRollout(lines: readonly string[]): { rows: CodexRow[]; unknown: Unknowns; issues: Issue[] } {
  const parsed = lines.filter((line) => line.trim() !== "").map(parseRolloutRow);
  const rows: CodexRow[] = [];
  const issues: Issue[] = [];
  for (const entry of parsed) {
    if (entry.ok) {
      rows.push(entry.record);
      issues.push(...entry.issues);
    }
  }
  return { rows, unknown: tallyUnknown(parsed), issues };
}
