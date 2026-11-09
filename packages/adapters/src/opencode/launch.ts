import { obj, num, parseRow, str, type Row } from "../core/rows.ts";
import { tallyUnknown, type Parsed, type Unknowns } from "../core/issues.ts";
import { EnvVar } from "../env.ts";
import { OpenCodeBuiltinActions, OpenCodeCli, OpenCodeMcpActions, OpenCodePermissionField, OpenCodeStreamField, OpenCodeStreamType } from "./constants.ts";
import { OpenCodeStreamEventType } from "./enums.ts";

export const OPENCODE_BINARY = OpenCodeCli.Binary;

export function opencodeDenyConfig(actions: readonly string[]): string {
  const rules = actions.map((action) => ({
    [OpenCodePermissionField.Action]: action,
    [OpenCodePermissionField.Resource]: OpenCodePermissionField.Any,
    [OpenCodePermissionField.Effect]: OpenCodePermissionField.Deny,
  }));
  return JSON.stringify({ [OpenCodePermissionField.List]: rules });
}

export const OPENCODE_TOOLLESS_CONFIG: string = opencodeDenyConfig([...OpenCodeBuiltinActions, ...OpenCodeMcpActions]);

export interface OpencodeRunOptions {
  readonly model: string;
  readonly title: string;
}

export interface OpencodeStream {
  readonly text: string;
  readonly cost: number;
  readonly session: string | null;
}

export interface OpencodeStreamReading extends OpencodeStream {
  readonly unknown: Unknowns;
}

export interface OpencodeSession {
  readonly id: string;
  readonly title: string;
}

export function opencodeArgs(opts: OpencodeRunOptions): string[] {
  return [OpenCodeCli.Run, OpenCodeCli.Format, OpenCodeCli.FormatJson, OpenCodeCli.Title, opts.title, ...(opts.model === "" ? [] : [OpenCodeCli.Model, opts.model])];
}

export function opencodeToollessEnv(): Record<string, string> {
  return { [EnvVar.OpenCodeConfigContent]: OPENCODE_TOOLLESS_CONFIG };
}

function eventsOf(stdout: string): Parsed<Row>[] {
  const entries: Parsed<Row>[] = [];
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const row = parseRow(line);
    if (row === null) {
      entries.push({ ok: false, reason: "not-json", type: null, row: null });
      continue;
    }
    const type = str(row[OpenCodeStreamField.Type]);
    if (type !== null && OpenCodeStreamEventType.safeParse(type).success) {
      entries.push({ ok: true, record: row, issues: [] });
      continue;
    }
    entries.push({ ok: false, reason: "unknown-type", type, row });
  }
  return entries;
}

export function readOpencodeStream(stdout: string): OpencodeStreamReading {
  const parsed = eventsOf(stdout);
  let text = "";
  let cost = 0;
  let session: string | null = null;
  for (const entry of parsed) {
    if (!entry.ok) {
      continue;
    }
    const event = entry.record;
    const observed = str(event[OpenCodeStreamField.SessionId]);
    if (observed !== null) {
      session = observed;
    }
    const part = obj(event[OpenCodeStreamField.Part]);
    const partText = str(part[OpenCodeStreamField.Text]);
    if (event[OpenCodeStreamField.Type] === OpenCodeStreamType.Text && partText !== null) {
      text += partText;
    }
    const partCost = num(part[OpenCodeStreamField.Cost]);
    if (event[OpenCodeStreamField.Type] === OpenCodeStreamType.StepFinish && partCost !== null) {
      cost += partCost;
    }
  }
  return { text, cost, session, unknown: tallyUnknown(parsed) };
}

export function parseOpencodeStream(stdout: string): OpencodeStream {
  const { text, cost, session } = readOpencodeStream(stdout);
  return { text, cost, session };
}

export function parseSessionList(json: string): readonly OpencodeSession[] {
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.flatMap((row: unknown) => {
    const fields = obj(row);
    const id = str(fields["id"]);
    const title = str(fields["title"]);
    return id !== null && title !== null ? [{ id, title }] : [];
  });
}

export function opencodeSessionListArgs(): string[] {
  return [OpenCodeCli.Session, OpenCodeCli.List, OpenCodeCli.Standalone, OpenCodeCli.Format, OpenCodeCli.FormatJson];
}

export function opencodeSessionDeleteArgs(id: string): string[] {
  return [OpenCodeCli.Session, OpenCodeCli.Delete, OpenCodeCli.Standalone, id];
}
