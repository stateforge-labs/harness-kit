import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll } from "bun:test";
import { fixturesDir } from "@homelab/harness-hooks";
import { eventually, startServer, type RunningServer } from "./harness.ts";

export type Payload = Record<string, unknown> & { hook_event_name: string; session_id: string };
export interface Fixture {
  harness: string;
  provenance: string;
  event: string;
  name: string;
  payload: Payload;
  expected: { status: number; body: unknown };
  log: Record<string, unknown>;
}

const FIXTURES = fixturesDir;

function provenanceOf(harness: string): (event: string, name: string) => string {
  const file = join(FIXTURES, harness, "provenance.json");
  const p = JSON.parse(readFileSync(file, "utf8")) as { default: string; overrides: Record<string, string> };
  return (event, name) => p.overrides[`${event}/${name}`] ?? p.default;
}

export function fixtures(harness: string, event?: string): Fixture[] {
  const root = join(FIXTURES, harness);
  if (!existsSync(root)) return [];
  const provenance = provenanceOf(harness);
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (!event || d.name === event))
    .map((d) => d.name)
    .sort()
    .flatMap((e) =>
      readdirSync(join(root, e))
        .filter((f) => f.endsWith(".json") && !f.endsWith(".expected.json") && !f.endsWith(".log.json"))
        .sort()
        .map((f) => {
          const name = f.slice(0, -5);
          const read = (file: string) => JSON.parse(readFileSync(join(root, e, file), "utf8"));
          return { harness, provenance: provenance(e, name), event: e, name, payload: read(f), expected: read(`${name}.expected.json`), log: read(`${name}.log.json`) } as Fixture;
        }),
    );
}

export function fixture(harness: string, event: string, nameFragment = ""): Fixture {
  const f = fixtures(harness, event).find((x) => x.name.includes(nameFragment));
  if (!f) throw new Error(`no ${harness} fixture for ${event} matching "${nameFragment}"`);
  return f;
}

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
  logFor(sessionId: string): Promise<{ entry: Record<string, any>; text: string }>;
  logText(): Promise<string>;
}

export function hookServer(harness: string, env: Record<string, string> = {}): Hook {
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
      fetch(`${srv.base}/hook/${harness}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init?.token ? { authorization: `Bearer ${init.token}` } : {}) },
        body: JSON.stringify(body),
      }),
    logFor: (sessionId) =>
      eventually(async () => {
        const text = await logText();
        const lines = text.split("\n");
        if (!text.endsWith("\n")) lines.pop();
        const line = lines.find((l) => l.includes(`"session_id":"${sessionId}"`));
        return line ? { entry: JSON.parse(line), text: line } : undefined;
      }),
    logText,
  };
}

export function forHarness(harness: string) {
  return {
    fixtures: (event?: string) => fixtures(harness, event),
    fixture: (event: string, nameFragment = "") => fixture(harness, event, nameFragment),
    hookServer: (env: Record<string, string> = {}) => hookServer(harness, env),
  };
}
