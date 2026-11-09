import { num, obj, parseRow, str } from "../../core/rows.ts";
import { PromptText } from "../../driver/constants.ts";
import { OpenCodeErrorField, OpenCodeStreamField, OpenCodeStreamType } from "../constants.ts";
import { OpenCodeStreamEventType } from "../enums.ts";

export interface OpencodeRunReading {
  readonly text: string;
  readonly cost: number | null;
  readonly sessionId: string | null;
  readonly error: { readonly message: string } | null;
  readonly unknownRows: readonly unknown[];
}

export function readOpencodeRun(stdout: string): OpencodeRunReading {
  let text = PromptText.Empty;
  let cost: number | null = null;
  let sessionId: string | null = null;
  let error: { readonly message: string } | null = null;
  const unknownRows: unknown[] = [];
  for (const line of stdout.split(PromptText.Line)) {
    const row = parseRow(line);
    if (row === null) {
      continue;
    }
    const type = str(row[OpenCodeStreamField.Type]);
    if (type === null || !OpenCodeStreamEventType.safeParse(type).success) {
      unknownRows.push(row);
      continue;
    }
    const observed = str(row[OpenCodeStreamField.SessionId]);
    if (observed !== null) {
      sessionId = observed;
    }
    const part = obj(row[OpenCodeStreamField.Part]);
    if (type === OpenCodeStreamType.Text) {
      text += str(part[OpenCodeStreamField.Text]) ?? PromptText.Empty;
    }
    const partCost = num(part[OpenCodeStreamField.Cost]);
    if (type === OpenCodeStreamType.StepFinish && partCost !== null) {
      cost = (cost ?? 0) + partCost;
    }
    if (type === OpenCodeStreamType.Error && error === null) {
      error = { message: str(obj(row[OpenCodeStreamField.Error])[OpenCodeErrorField.Message]) ?? PromptText.Empty };
    }
  }
  return { text, cost, sessionId, error, unknownRows };
}

export function opencodeTextOf(line: string): string | null {
  const row = parseRow(line);
  if (row === null || row[OpenCodeStreamField.Type] !== OpenCodeStreamType.Text) {
    return null;
  }
  return str(obj(row[OpenCodeStreamField.Part])[OpenCodeStreamField.Text]);
}
