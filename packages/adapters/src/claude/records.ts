import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { tallyUnknown, observeEnum, type Issue, type Parsed, type Site, type Unknowns } from "../core/issues.ts";
import { arr, num, obj, parseRow, stamp, str, type Row } from "../core/rows.ts";
import {
  ClaudeAttachmentType,
  ClaudeBlockType,
  ClaudeNoise,
  ClaudeOrigin,
  ClaudeSubtype,
  ClaudeType,
} from "./constants.ts";
import {
  ClaudeAttachmentKind,
  ClaudeCompactTrigger,
  ClaudeContentKind,
  ClaudeOriginKind,
  ClaudeQueueKind,
  ClaudeRecordKind,
  ClaudeSystemSubtype,
} from "./enums.ts";

const HARNESS: HarnessId = Harness.Claude;

export interface ClaudeBase {
  readonly row: Row;
  readonly at: number | null;
  readonly sidechain: boolean;
}

export type ClaudeBlock =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "tool_use"; readonly id: string | null; readonly name: string; readonly input: Row }
  | { readonly kind: "tool_result"; readonly toolUseId: string | null; readonly text: string }
  | { readonly kind: "other"; readonly blockType: string | null };

export interface ClaudeCompact {
  readonly preTokens: number | null;
  readonly postTokens: number | null;
  readonly durationMs: number | null;
  readonly trigger: ClaudeCompactTrigger | null;
}

export interface ClaudeToolUse {
  readonly name: string;
  readonly id: string | null;
  readonly input: Row;
}

export type ClaudeRecord =
  | (ClaudeBase & {
      readonly kind: "user";
      readonly text: string;
      readonly blocks: readonly ClaudeBlock[];
      readonly isMeta: boolean;
      readonly isCompactSummary: boolean;
      readonly toolUseResult: Row;
    })
  | (ClaudeBase & { readonly kind: "assistant"; readonly blocks: readonly ClaudeBlock[]; readonly model: string | null; readonly usage: Row })
  | (ClaudeBase & { readonly kind: "system"; readonly subtype: string | null; readonly content: string | null; readonly compact: ClaudeCompact | null })
  | (ClaudeBase & { readonly kind: "ai-title"; readonly title: string })
  | (ClaudeBase & { readonly kind: "last-prompt"; readonly prompt: string })
  | (ClaudeBase & { readonly kind: "queue-operation"; readonly operation: string | null; readonly content: string })
  | (ClaudeBase & { readonly kind: "attachment"; readonly attachmentType: string | null; readonly prompt: string | null; readonly originKind: string | null })
  | (ClaudeBase & { readonly kind: "passthrough"; readonly type: string });

const figure = (value: unknown): number | null => {
  const n = num(value);
  return n !== null && n >= 0 ? n : null;
};

function textOf(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  return arr(content)
    .filter((block) => block["type"] === ClaudeBlockType.Text)
    .map((block) => str(block["text"]) ?? "")
    .join("\n");
}

function resultTextOf(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  return arr(content)
    .map((block) => str(block["text"]) ?? "")
    .join("\n");
}

function blockOf(block: Row, site: Site, issues: Issue[]): ClaudeBlock {
  const type = str(block["type"]);
  const known = observeEnum(ClaudeContentKind, type ?? undefined, site, issues);
  if (known === ClaudeBlockType.Text) {
    return { kind: "text", text: str(block["text"]) ?? "" };
  }
  if (known === ClaudeBlockType.ToolUse) {
    return { kind: "tool_use", id: str(block["id"]), name: str(block["name"]) ?? "", input: obj(block["input"]) };
  }
  if (known === ClaudeBlockType.ToolResult) {
    return { kind: "tool_result", toolUseId: str(block["tool_use_id"]), text: resultTextOf(block["content"]) };
  }
  return { kind: "other", blockType: type };
}

function blocksOf(content: unknown, site: Site, issues: Issue[]): ClaudeBlock[] {
  if (typeof content === "string") {
    return [{ kind: "text", text: content }];
  }
  return arr(content).map((block) => blockOf(block, site, issues));
}

function compactOf(metadata: Row, site: Site, issues: Issue[]): ClaudeCompact {
  return {
    preTokens: figure(metadata["preTokens"]),
    postTokens: figure(metadata["postTokens"]),
    durationMs: figure(metadata["durationMs"]),
    trigger: observeEnum(ClaudeCompactTrigger, str(metadata["trigger"]) ?? undefined, { ...site, path: "compactMetadata.trigger" }, issues),
  };
}

function build(type: ClaudeRecordKind, base: ClaudeBase, row: Row, issues: Issue[]): ClaudeRecord {
  const message = obj(row["message"]);
  const site = (path: string): Site => ({ harness: HARNESS, record: type, path });
  if (type === ClaudeType.User) {
    return {
      ...base,
      kind: "user",
      text: textOf(message["content"]),
      blocks: blocksOf(message["content"], site("message.content.type"), issues),
      isMeta: row["isMeta"] === true,
      isCompactSummary: row["isCompactSummary"] === true,
      toolUseResult: obj(row["toolUseResult"]),
    };
  }
  if (type === ClaudeType.Assistant) {
    return { ...base, kind: "assistant", blocks: blocksOf(message["content"], site("message.content.type"), issues), model: str(message["model"]), usage: obj(message["usage"]) };
  }
  if (type === ClaudeType.System) {
    const subtype = str(row["subtype"]);
    observeEnum(ClaudeSystemSubtype, subtype ?? undefined, site("subtype"), issues);
    const compact = subtype === ClaudeSubtype.CompactBoundary ? compactOf(obj(row["compactMetadata"]), site("compactMetadata"), issues) : null;
    return { ...base, kind: "system", subtype, content: str(row["content"]), compact };
  }
  if (type === ClaudeType.AiTitle) {
    return { ...base, kind: "ai-title", title: str(row["aiTitle"]) ?? "" };
  }
  if (type === ClaudeType.LastPrompt) {
    return { ...base, kind: "last-prompt", prompt: unwrapPastedContent(str(row["lastPrompt"]) ?? "") };
  }
  if (type === ClaudeType.QueueOperation) {
    const operation = str(row["operation"]);
    observeEnum(ClaudeQueueKind, operation ?? undefined, site("operation"), issues);
    return { ...base, kind: "queue-operation", operation, content: str(row["content"]) ?? "" };
  }
  if (type === ClaudeType.Attachment) {
    const attachment = obj(row["attachment"]);
    const attachmentType = str(attachment["type"]);
    const origin = str(obj(attachment["origin"])["kind"]);
    observeEnum(ClaudeAttachmentKind, attachmentType ?? undefined, site("attachment.type"), issues);
    observeEnum(ClaudeOriginKind, origin ?? undefined, site("attachment.origin.kind"), issues);
    return {
      ...base,
      at: stamp(attachment["timestamp"]) ?? base.at,
      kind: "attachment",
      attachmentType,
      prompt: str(attachment["prompt"]),
      originKind: origin,
    };
  }
  return { ...base, kind: "passthrough", type };
}

export function parseClaudeRecord(line: string): Parsed<ClaudeRecord> {
  const row = parseRow(line);
  if (row === null) {
    return { ok: false, reason: "not-json", type: null, row: null };
  }
  const type = str(row["type"]);
  if (type === null || !ClaudeRecordKind.safeParse(type).success) {
    return { ok: false, reason: "unknown-type", type, row };
  }
  const issues: Issue[] = [];
  const base: ClaudeBase = { row, at: stamp(row["timestamp"]), sidechain: row["isSidechain"] === true };
  const record = build(ClaudeRecordKind.parse(type), base, row, issues);
  return { ok: true, record, issues };
}

export function readClaudeRecords(lines: readonly string[]): { records: ClaudeRecord[]; unknown: Unknowns; issues: Issue[] } {
  const parsed = lines.filter((line) => line.trim() !== "").map(parseClaudeRecord);
  const records: ClaudeRecord[] = [];
  const issues: Issue[] = [];
  for (const entry of parsed) {
    if (entry.ok) {
      records.push(entry.record);
      issues.push(...entry.issues);
    }
  }
  return { records, unknown: tallyUnknown(parsed), issues };
}

export function unwrapPastedContent(text: string): string {
  const match = ClaudeNoise.PastedContent.exec(text);
  return match === null ? text : (match[2] ?? "");
}

export function isNoise(text: string): boolean {
  const head = text.trimStart();
  return ClaudeNoise.Prefixes.some((prefix) => head.startsWith(prefix));
}

function promptOf(raw: string): string | null {
  const text = unwrapPastedContent(raw);
  return text === "" || isNoise(text) ? null : text;
}

export function humanPrompt(record: ClaudeRecord): string | null {
  if (record.kind === "user") {
    return record.sidechain || record.isMeta || record.isCompactSummary ? null : promptOf(record.text);
  }
  if (record.kind === "attachment") {
    const queued = record.attachmentType === ClaudeAttachmentType.QueuedCommand && record.originKind === ClaudeOrigin.Human;
    return record.sidechain || !queued || record.prompt === null ? null : promptOf(record.prompt);
  }
  return null;
}

export function compactBoundary(record: ClaudeRecord): ClaudeCompact | null {
  return record.kind === "system" ? record.compact : null;
}

function saidOf(record: ClaudeRecord): string {
  if (record.kind === "user") {
    return record.text;
  }
  if (record.kind === "system") {
    return record.content ?? "";
  }
  if (record.kind === "assistant") {
    return record.blocks
      .flatMap((block) => (block.kind === "text" ? [block.text] : []))
      .join("\n");
  }
  return "";
}

export function compactionFailed(record: ClaudeRecord): boolean {
  const said = saidOf(record);
  if (!said.includes(ClaudeNoise.CompactFailure)) {
    return false;
  }
  const localCommand = record.kind === "system" && record.subtype === ClaudeSubtype.LocalCommand;
  return localCommand || said.includes(ClaudeNoise.LocalStderr);
}

export function awaySummary(record: ClaudeRecord): string | null {
  return record.kind === "system" && record.subtype === ClaudeSubtype.AwaySummary ? record.content : null;
}

export function compactSummary(record: ClaudeRecord): string | null {
  if (record.kind !== "user" || !record.isCompactSummary) {
    return null;
  }
  const text = record.text.trim();
  return text === "" ? null : text;
}

export function toolUses(record: ClaudeRecord): readonly ClaudeToolUse[] {
  if (record.kind !== "assistant" || record.sidechain) {
    return [];
  }
  return record.blocks.flatMap((block) => (block.kind === "tool_use" ? [{ name: block.name, id: block.id, input: block.input }] : []));
}
