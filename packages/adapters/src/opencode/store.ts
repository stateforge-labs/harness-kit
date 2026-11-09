import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { arr, num, str, type Row } from "../core/rows.ts";
import { adapterEnv, type AdapterEnv } from "../env.ts";
import { OpenCodeDir, OpenCodeField, OpenCodeSql } from "./constants.ts";

export interface StoredMessage {
  readonly id: string;
  readonly timeUpdated: number;
  readonly data: string;
}

export interface OpenCodeStore {
  rootSessionForDirectory(directory: string): string | null;
  sessionTitle(session: string): string | null;
  messagesSince(session: string, sinceUpdated: number, limit: number): readonly StoredMessage[];
  recentMessages(session: string, limit: number): readonly StoredMessage[];
  partsOf(messageId: string): readonly string[];
  recentParts(session: string, messageLimit: number): readonly string[];
  close(): void;
}

type Param = string | number;

export function opencodeDatabasePath(env: AdapterEnv = adapterEnv()): string {
  return join(env.xdgDataHome, OpenCodeDir.Data, OpenCodeDir.Database);
}

export function openOpencodeStore(path: string): OpenCodeStore | null {
  try {
    return storeOver(new DatabaseSync(path, { readOnly: true }));
  } catch {
    return null;
  }
}

function guard<T>(fallback: T, read: () => T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function messagesOf(rows: readonly Row[]): StoredMessage[] {
  return rows.flatMap((row) => {
    const id = str(row[OpenCodeField.Id]);
    const data = str(row[OpenCodeField.Data]);
    return id === null || data === null ? [] : [{ id, timeUpdated: num(row[OpenCodeField.TimeUpdated]) ?? 0, data }];
  });
}

function dataOf(rows: readonly Row[]): string[] {
  return rows.flatMap((row) => {
    const data = str(row[OpenCodeField.Data]);
    return data === null ? [] : [data];
  });
}

function storeOver(db: DatabaseSync): OpenCodeStore {
  const rows = (sql: string, ...params: Param[]): readonly Row[] => arr(db.prepare(sql).all(...params));
  const first = (sql: string, ...params: Param[]): Row => arr(db.prepare(sql).all(...params))[0] ?? {};
  return {
    rootSessionForDirectory: (directory) => guard(null, () => str(first(OpenCodeSql.RootSession, directory)[OpenCodeField.Id])),
    sessionTitle: (session) => guard(null, () => str(first(OpenCodeSql.SessionTitle, session)[OpenCodeField.Title])),
    messagesSince: (session, sinceUpdated, limit) => guard([], () => messagesOf(rows(OpenCodeSql.MessagesSince, session, sinceUpdated, limit))),
    recentMessages: (session, limit) => guard([], () => messagesOf(rows(OpenCodeSql.RecentMessages, session, limit))),
    partsOf: (messageId) => guard([], () => dataOf(rows(OpenCodeSql.PartsOf, messageId))),
    recentParts: (session, messageLimit) => guard([], () => dataOf(rows(OpenCodeSql.RecentParts, session, messageLimit))),
    close: () => guard(undefined, () => db.close()),
  };
}
