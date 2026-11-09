import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapterEnv } from "../../src/env.ts";
import { str, type Row } from "../../src/core/rows.ts";
import { adaptersFixtures } from "../support/fixtures.ts";
import type { OpenCodeStore } from "../../src/opencode/store.ts";

const sqliteAvailable = await import("node:sqlite").then(
  () => true,
  () => false,
);
const storeModule = sqliteAvailable ? await import("../../src/opencode/store.ts") : null;
const sqlite = sqliteAvailable ? await import("node:sqlite") : null;

const base = join(adaptersFixtures, "opencode");
const tables = JSON.parse(readFileSync(join(base, "rows-v1.json"), "utf8")) as { readonly session: readonly Row[]; readonly message: readonly Row[]; readonly part: readonly Row[] };
const schema = readFileSync(join(base, "schema.sql"), "utf8");
const WORKTREE = "/tmp/e96L-wt";
const ROOT = "ses_00000000000000000000000007";
const BUSY = "ses_00000000000000000000000008";

const byCreatedDesc = (rows: readonly Row[]): Row[] => [...rows].sort((a, b) => Number(b.time_created) - Number(a.time_created));

const suite = sqliteAvailable ? describe : describe.skip;
const SEED_TWO_TIMEOUT_MS = 30_000;
const title = sqliteAvailable ? "opencode store" : "opencode store skipped: node:sqlite is unavailable on this runtime";

suite(title, () => {
  let dir = "";
  let dbPath = "";

  const seed = (path: string, edit?: (db: InstanceType<NonNullable<typeof sqlite>["DatabaseSync"]>) => void): void => {
    const db = new sqlite!.DatabaseSync(path);
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(schema);
    for (const table of ["session", "message", "part"] as const) {
      for (const row of tables[table]) {
        const keys = Object.keys(row);
        db.prepare(`INSERT INTO ${table} (${keys.map((key) => `"${key}"`).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(
          ...keys.map((key) => row[key] as string | number | null),
        );
      }
    }
    edit?.(db);
    db.close();
  };

  const open = (path = dbPath): OpenCodeStore => {
    const store = storeModule!.openOpencodeStore(path);
    if (store === null) {
      throw new Error(`expected a store at ${path}`);
    }
    return store;
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "oc-store-"));
    dbPath = join(dir, "opencode.db");
    seed(dbPath);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("the database path follows XDG_DATA_HOME and falls back to the home share folder", () => {
    expect(storeModule!.opencodeDatabasePath(adapterEnv({ XDG_DATA_HOME: join("/data") }))).toBe(join("/data", "opencode", "opencode.db"));
    expect(storeModule!.opencodeDatabasePath(adapterEnv({ HOME: join("/h") }))).toBe(join("/h", ".local", "share", "opencode", "opencode.db"));
  });

  test("a missing or unopenable file gives null", () => {
    expect(storeModule!.openOpencodeStore(join(dir, "missing.db"))).toBeNull();
  });

  test("the root session is the newest session of the directory that has no parent and is not archived", () => {
    expect(open().rootSessionForDirectory(WORKTREE)).toBe(ROOT);
    expect(open().rootSessionForDirectory("/nowhere")).toBeNull();
  });

  test("an archived or child session is never the root", () => {
    const path = join(dir, "excluded.db");
    seed(path, (db) => {
      db.exec(`UPDATE session SET time_archived = 1 WHERE id = '${ROOT}'`);
    });
    expect(open(path).rootSessionForDirectory(WORKTREE)).toBe("ses_00000000000000000000000006");
    const childPath = join(dir, "child.db");
    seed(childPath, (db) => {
      db.exec(`UPDATE session SET time_archived = 1 WHERE id = '${ROOT}'`);
      db.exec("UPDATE session SET parent_id = 'ses_00000000000000000000000003' WHERE id = 'ses_00000000000000000000000006'");
    });
    expect(open(childPath).rootSessionForDirectory(WORKTREE)).toBe("ses_00000000000000000000000005");
  }, SEED_TWO_TIMEOUT_MS);

  test("the session title is read from the session row", () => {
    const title = tables.session.find((row) => row.id === "ses_00000000000000000000000002")?.title;
    expect(open().sessionTitle("ses_00000000000000000000000002")).toBe(str(title));
    expect(open().sessionTitle("ses_missing")).toBeNull();
  });

  test("messages since a cursor are the newest first and respect the limit", () => {
    const store = open();
    const all = byCreatedDesc(tables.message.filter((row) => row.session_id === BUSY));
    expect(store.recentMessages(BUSY, 100).map((message) => message.id)).toEqual(all.map((row) => String(row.id)));
    expect(store.recentMessages(BUSY, 3).map((message) => message.id)).toEqual(all.slice(0, 3).map((row) => String(row.id)));
    const cursor = Math.min(...all.map((row) => Number(row.time_updated))) - 1;
    expect(store.messagesSince(BUSY, cursor, 100).length).toBe(all.length);
    const latest = Math.max(...all.map((row) => Number(row.time_updated)));
    expect(store.messagesSince(BUSY, latest, 100)).toEqual([]);
    expect(store.messagesSince(BUSY, cursor, 2).map((message) => message.id)).toEqual(all.slice(0, 2).map((row) => String(row.id)));
  });

  test("a stored message carries its update time and its data text", () => {
    const first = open().recentMessages(BUSY, 1)[0];
    const row = byCreatedDesc(tables.message.filter((candidate) => candidate.session_id === BUSY))[0];
    expect(first).toEqual({ id: String(row?.id), timeUpdated: Number(row?.time_updated), data: String(row?.data) });
  });

  test("the parts of a message are in creation order", () => {
    const message = tables.message.find((row) => row.session_id === BUSY);
    const expected = tables.part.filter((row) => row.message_id === message?.id).sort((a, b) => Number(a.time_created) - Number(b.time_created));
    expect(open().partsOf(String(message?.id))).toEqual(expected.map((row) => str(row.data) ?? ""));
  });

  test("the recent parts are the parts of the newest messages of the session", () => {
    const newest = byCreatedDesc(tables.message.filter((row) => row.session_id === BUSY)).slice(0, 2).map((row) => String(row.id));
    const expected = tables.part.filter((row) => newest.includes(String(row.message_id))).map((row) => str(row.data) ?? "").sort();
    expect([...open().recentParts(BUSY, 2)].sort()).toEqual(expected);
  });

  test("a write through a read-only handle to the same file is refused", () => {
    const raw = new sqlite!.DatabaseSync(dbPath, { readOnly: true });
    try {
      expect(() => raw.exec(`DELETE FROM session WHERE id = '${ROOT}'`)).toThrow();
    } finally {
      raw.close();
    }
  });

  test("after close every query returns the empty result instead of throwing", () => {
    const store = open();
    store.close();
    expect(store.rootSessionForDirectory(WORKTREE)).toBeNull();
    expect(store.recentMessages(BUSY, 5)).toEqual([]);
    expect(store.partsOf("msg_missing")).toEqual([]);
    expect(store.recentParts(BUSY, 2)).toEqual([]);
  });

  test("a database without the opencode tables answers every query with the empty result", () => {
    const path = join(dir, "empty.db");
    new sqlite!.DatabaseSync(path).close();
    const store = open(path);
    expect(store.rootSessionForDirectory(WORKTREE)).toBeNull();
    expect(store.messagesSince(BUSY, 0, 5)).toEqual([]);
    expect(store.recentParts(BUSY, 2)).toEqual([]);
    store.close();
  });
});
