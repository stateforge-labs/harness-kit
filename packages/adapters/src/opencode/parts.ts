import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { observeEnum, type Issue, type Parsed, type Site } from "../core/issues.ts";
import { num, obj, parseRow, str, type Row } from "../core/rows.ts";
import { OpenCodeField, OpenCodeKind, OpenCodeModeName, OpenCodePartType, OpenCodeRecord, OpenCodeStatus } from "./constants.ts";
import { OpenCodeMessageMode, OpenCodePartStatus, OpenCodePartTypeName, OpenCodeRole } from "./enums.ts";

const HARNESS: HarnessId = Harness.OpenCode;

export interface OpenCodePart {
  readonly kind: OpenCodeKind;
  readonly row: Row;
  readonly partType: string;
  readonly text: string | null;
  readonly synthetic: boolean;
  readonly ignored: boolean;
  readonly tool: string | null;
  readonly input: Row;
  readonly status: string | null;
  readonly startedAt: number | null;
}

export interface OpenCodeMessage {
  readonly row: Row;
  readonly role: string | null;
  readonly createdAt: number | null;
  readonly completedAt: number | null;
  readonly isCompaction: boolean;
  readonly providerId: string | null;
  readonly modelId: string | null;
}

const at = (record: string, path: string): Site => ({ harness: HARNESS, record, path });

const millis = (value: unknown): number | null => {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
};

const kindOf = (partType: string): OpenCodeKind => {
  if (partType === OpenCodePartType.Text) {
    return OpenCodeKind.Text;
  }
  return partType === OpenCodePartType.Tool ? OpenCodeKind.Tool : OpenCodeKind.Other;
};

export function parsePart(json: string): Parsed<OpenCodePart> {
  const row = parseRow(json);
  if (row === null) {
    return { ok: false, reason: "not-json", type: null, row: null };
  }
  const partType = str(row[OpenCodeField.Type]);
  if (partType === null) {
    return { ok: false, reason: "unknown-type", type: null, row };
  }
  const issues: Issue[] = [];
  observeEnum(OpenCodePartTypeName, partType, at(OpenCodeRecord.Part, OpenCodeField.Type), issues);
  const kind = kindOf(partType);
  const state = obj(row[OpenCodeField.State]);
  const isTool = kind === OpenCodeKind.Tool;
  const status = isTool ? str(state[OpenCodeField.Status]) : null;
  if (isTool) {
    observeEnum(OpenCodePartStatus, status, at(OpenCodeRecord.Part, `${OpenCodeField.State}.${OpenCodeField.Status}`), issues);
  }
  return {
    ok: true,
    record: {
      kind,
      row,
      partType,
      text: str(row[OpenCodeField.Text]),
      synthetic: row[OpenCodeField.Synthetic] === true,
      ignored: row[OpenCodeField.Ignored] === true,
      tool: isTool ? str(row[OpenCodeField.Tool]) : null,
      input: isTool ? obj(state[OpenCodeField.Input]) : {},
      status,
      startedAt: millis(obj(row[OpenCodeField.Time])[OpenCodeField.Start]),
    },
    issues,
  };
}

export function parseMessage(json: string): Parsed<OpenCodeMessage> {
  const row = parseRow(json);
  if (row === null) {
    return { ok: false, reason: "not-json", type: null, row: null };
  }
  const issues: Issue[] = [];
  const role = str(row[OpenCodeField.Role]);
  observeEnum(OpenCodeRole, role, at(OpenCodeRecord.Message, OpenCodeField.Role), issues);
  const mode = str(row[OpenCodeField.Mode]);
  if (mode !== null && mode !== OpenCodeModeName.Compaction) {
    observeEnum(OpenCodeMessageMode, mode, at(OpenCodeRecord.Message, OpenCodeField.Mode), issues);
  }
  const time = obj(row[OpenCodeField.Time]);
  const model = obj(row[OpenCodeField.Model]);
  return {
    ok: true,
    record: {
      row,
      role,
      createdAt: millis(time[OpenCodeField.Created]),
      completedAt: millis(time[OpenCodeField.Completed]),
      isCompaction: row[OpenCodeField.Summary] === true && mode === OpenCodeModeName.Compaction,
      providerId: str(row[OpenCodeField.ProviderId]) ?? str(model[OpenCodeField.ProviderId]),
      modelId: str(row[OpenCodeField.ModelId]) ?? str(model[OpenCodeField.ModelId]),
    },
    issues,
  };
}

export function isToolInFlight(part: OpenCodePart): boolean {
  return part.kind === OpenCodeKind.Tool && (part.status === OpenCodeStatus.Pending || part.status === OpenCodeStatus.Running);
}

export function humanText(part: OpenCodePart): string | null {
  if (part.kind !== OpenCodeKind.Text || part.text === null || part.synthetic || part.ignored || part.text.trim() === "") {
    return null;
  }
  return part.text;
}
