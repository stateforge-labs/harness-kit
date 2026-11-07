// One suite that every event of every harness must pass, driven by the fixtures in test/fixtures/<harness>.
// Each registered adapter that has fixtures gets the whole suite; event files under test/e2e/events/<harness>/
// hold only what is special about one event.
import { describe, expect, test } from "bun:test";
import { adapters } from "../../src/adapters/index.ts";
import { fixtures, hookServer, variant, type Fixture } from "./kit.ts";

/** Keys whose values the server may log, because they are short identifiers or enumerations, never typed text. */
const MAY_LOG = new Set([
  "session_id", "agent_id", "agent_type", "tool_name", "permission_mode", "prompt_id", "level",
  "source", "trigger", "event", "error", "action", "mode", "load_reason", "memory_type", "notification_type",
  "expansion_type", "command_name", "command_source", "mcp_server_name", "from_model", "to_model", "requested_model",
  "pricing", "subagent_type", "model", "message_id", "turn_id", "elicitation_id", "task_id", "teammate_name", "team_name",
  "name", "reason", // reason: SessionEnd enum and the PermissionDenied classifier tag, both short labels
]);


for (const [harness, adapter] of adapters) {
  const all = fixtures(harness);
  if (all.length === 0) continue; // an adapter without fixtures yet has nothing for this suite to drive
  const hook = hookServer(harness);
  const events = [...new Set(all.map((f) => f.event))];
  const requiredKeys = (event: string): string[] =>
    ((adapter.jsonSchemas()[event] as { required?: string[] }).required ?? []).filter((k) => k !== "hook_event_name");

  describe(`contract[${harness}]: every fixture`, () => {
    test("there is a fixture for every event the adapter has a schema for", () => {
      expect(events).toEqual(Object.keys(adapter.jsonSchemas()).sort());
    });

    test("every fixture says where it came from", () => {
      for (const f of all) expect(f.provenance).toMatch(/^(captured|synthetic \(.+\))$/);
    });

    test.each(all.map((f) => [`${f.event}/${f.name}`, f] as const))("%s: answered exactly as recorded, and logged as known and well-formed", async (_n, f: Fixture) => {
      const body = variant(f);
      const res = await hook.post(body);
      expect(res.status).toBe(f.expected.status);
      expect(await res.json()).toEqual(f.expected.body);
      const { entry } = await hook.logFor(body.session_id);
      expect(entry.event).toBe(f.event);
      expect(entry.known).toBe(true);
      expect(entry.missing).toEqual([]);
      expect(entry.wrong_type).toEqual([]);
      // The whole line, byte for byte except the timestamp and the session id the test chose: keys, order and values.
      const { ts: _ts, ...line } = entry;
      line.session_id = f.log.session_id;
      expect(JSON.stringify(line)).toBe(JSON.stringify(f.log));
    });
  });

  /** A damaged payload may change the answer, but never into one that stops the agent or denies the action. */
  function expectNeverBlocks(answer: unknown): void {
    expect(answer).not.toBeNull();
    expect(typeof answer).toBe("object");
    const a = answer as { decision?: unknown; continue?: unknown; hookSpecificOutput?: { permissionDecision?: unknown; decision?: unknown } };
    expect(a.decision).not.toBe("block");
    expect(a.continue).not.toBe(false);
    expect(a.hookSpecificOutput?.permissionDecision).not.toBe("deny");
    expect(a.hookSpecificOutput?.decision).not.toBe("deny");
  }

  describe(`contract[${harness}]: a bad payload is reported, never rejected`, () => {
    test.each(events.map((e) => [e] as const))("%s: a payload with no session_id is still answered 200 and never blocks", async (event) => {
      const f = fixtures(harness, event)[0]!;
      const { session_id: _gone, ...rest } = f.payload;
      const res = await hook.post(rest);
      expect(res.status).toBe(200);
      expectNeverBlocks(await res.json());
    });

    test.each(events.map((e) => [e] as const))("%s: each required key removed is logged as missing, and the answer stays 200", async (event) => {
      const f = fixtures(harness, event)[0]!;
      for (const key of requiredKeys(event)) {
        const body = variant(f, { [key]: undefined }, `miss-${event}-${key}`);
        // session_id is how the test finds its line; keep a stand-in for it
        if (key === "session_id") continue;
        const res = await hook.post(body);
        expect(res.status).toBe(200);
        // A damaged payload must never turn into a block: the answer may differ from the recorded one, but it never stops the agent.
        expectNeverBlocks(await res.json());
        const { entry } = await hook.logFor(body.session_id);
        expect(entry.missing).toEqual([key]);
        expect(entry.wrong_type).toEqual([]);
      }
    });

    test.each(events.map((e) => [e] as const))("%s: a string key sent as a number is logged as wrong_type with no value", async (event) => {
      const f = fixtures(harness, event)[0]!;
      const key = requiredKeys(event).find((k) => typeof f.payload[k] === "string" && !["session_id", "hook_event_name", "tool_name"].includes(k));
      if (!key) return; // events with no string-typed key of their own: nothing to retype
      const body = variant(f, { [key]: 987654 }, `type-${event}`);
      const res = await hook.post(body);
      expect(res.status).toBe(200);
      const { entry, text } = await hook.logFor(body.session_id);
      expect(entry.wrong_type).toEqual([`${key}: expected string`]);
      expect(entry.missing).toEqual([]);
      expect(text).not.toContain("987654");
    });
  });

  describe(`contract[${harness}]: privacy`, () => {
    test.each(all.map((f) => [`${f.event}/${f.name}`, f] as const))("%s: no typed text reaches the log", async (_n, f: Fixture) => {
      const fill = (v: unknown, key: string): unknown =>
        typeof v === "string" ? `SECRET<${key}>`
        : Array.isArray(v) ? v.map((x) => fill(x, key))
        : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, k)]))
        : v;
      const body = { ...(fill(f.payload, "") as Record<string, unknown>), hook_event_name: f.event, session_id: `priv-${f.event}-${f.name}` };
      const res = await hook.post(body);
      expect(res.status).toBe(200);
      const { text } = await hook.logFor(body.session_id as string);
      const leaked = [...text.matchAll(/SECRET<([^>]*)>/g)].map((m) => m[1]!).filter((k) => !MAY_LOG.has(k));
      expect(leaked).toEqual([]);
    });
  });
}
