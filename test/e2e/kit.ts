// Shared pieces for the e2e tests, so a test file only says what is special about its event.
//   const hook = hookServer();                          // boots the real server for this file
//   const res = await hook.post(variant(fixture("PreCompact"), { trigger: "auto" }));
//   const { entry, text } = await hook.logFor(sessionIdOfThatPayload);
// Fixtures are real captured payloads (scrubbed) under test/fixtures; see scripts/export-fixtures.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll } from "bun:test";
import { eventually, startServer, type RunningServer } from "./harness.ts";

export type Payload = Record<string, unknown> & { hook_event_name: string; session_id: string };
export interface Fixture {
  event: string;
  /** File name without `.json`, for example `02-bash`. */
  name: string;
  payload: Payload;
  /** The status and body the server returned for this payload when the fixtures were recorded. */
  expected: { status: number; body: unknown };
  /** The log line the server wrote for this payload when the fixtures were recorded, without `ts`. */
  log: Record<string, unknown>;
}

const FIXTURES = join(import.meta.dir, "..", "fixtures");

export function fixtures(event?: string): Fixture[] {
  return readdirSync(FIXTURES)
    .filter((e) => !event || e === event)
    .sort()
    .flatMap((e) =>
      readdirSync(join(FIXTURES, e))
        .filter((f) => f.endsWith(".json") && !f.endsWith(".expected.json") && !f.endsWith(".log.json"))
        .sort()
        .map((f) => {
          const name = f.slice(0, -5);
          const read = (file: string) => JSON.parse(readFileSync(join(FIXTURES, e, file), "utf8"));
          return { event: e, name, payload: read(f), expected: read(`${name}.expected.json`), log: read(`${name}.log.json`) } as Fixture;
        }),
    );
}

/** One fixture of an event: by name fragment (`"bash"`) or the first one. */
export function fixture(event: string, nameFragment = ""): Fixture {
  const f = fixtures(event).find((x) => x.name.includes(nameFragment));
  if (!f) throw new Error(`no fixture for ${event} matching "${nameFragment}"`);
  return f;
}

/**
 * A copy of a fixture's payload with a fresh session id and some keys changed.
 * A value of `undefined` removes the key. The session id is how a test finds its own log line.
 */
export function variant(from: Fixture | Payload, patch: Record<string, unknown> = {}, sessionId?: string): Payload {
  const base = "payload" in from && "expected" in from ? (from as Fixture).payload : (from as Payload);
  const out: Record<string, unknown> = { ...base, session_id: sessionId ?? `t-${crypto.randomUUID()}` };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out as Payload;
}

export interface Hook {
  readonly base: string;
  post(body: unknown, init?: { token?: string }): Promise<Response>;
  /** The parsed log line for a session id, waiting for it to be written. */
  logFor(sessionId: string): Promise<{ entry: Record<string, any>; text: string }>;
  /** The whole log file as text. */
  logText(): Promise<string>;
}

/** Starts the real server once for the surrounding describe block / file and stops it afterwards. */
export function hookServer(env: Record<string, string> = {}): Hook {
  let srv: RunningServer;
  beforeAll(async () => {
    srv = await startServer(env);
  });
  afterAll(() => srv?.stop());

  const logText = async () => {
    const f = Bun.file(srv.logFile);
    return (await f.exists()) ? await f.text() : "";
  };
  return {
    get base() {
      return srv.base;
    },
    post: (body, init) =>
      fetch(`${srv.base}/hook`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.token ? { authorization: `Bearer ${init.token}` } : {}) },
        body: JSON.stringify(body),
      }),
    logFor: (sessionId) =>
      eventually(async () => {
        // only complete lines: the server may be mid-write, and a partial line is not JSON yet
        const text = await logText();
        const lines = text.split("\n");
        if (!text.endsWith("\n")) lines.pop();
        const line = lines.find((l) => l.includes(`"session_id":"${sessionId}"`));
        return line ? { entry: JSON.parse(line), text: line } : undefined;
      }),
    logText,
  };
}
