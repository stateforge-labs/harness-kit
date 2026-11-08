import { describe, expect, test } from "bun:test";
import { adapters } from "@stateforge-labs/harness-hooks";
import { fixtures, hookServer, variant, type Fixture } from "./kit.ts";

const MAY_LOG = new Set([
  "session_id", "harness", "agent_id", "agent_type", "tool_name", "permission_mode", "prompt_id", "level",
  "source", "trigger", "event", "error", "action", "mode", "load_reason", "memory_type", "notification_type",
  "expansion_type", "command_name", "command_source", "mcp_server_name", "from_model", "to_model", "requested_model",
  "pricing", "subagent_type", "model", "message_id", "turn_id", "elicitation_id", "task_id", "teammate_name", "team_name",
  "name", "reason",
  "effect", "delivery", "source_type",
  "agent", "type", "tool",
  "status",
]);


for (const [harness, adapter] of adapters) {
  const all = fixtures(harness);
  if (all.length === 0) continue;
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
      const { ts: _ts, ...line } = entry;
      line.session_id = f.log.session_id;
      expect(JSON.stringify(line)).toBe(JSON.stringify(f.log));
    });
  });

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
        if (key === "session_id") continue;
        const res = await hook.post(body);
        expect(res.status).toBe(200);
        expectNeverBlocks(await res.json());
        const { entry } = await hook.logFor(body.session_id);
        expect(entry.missing).toEqual([key]);
        expect(entry.wrong_type).toEqual([]);
      }
    });

    test.each(events.map((e) => [e] as const))("%s: a string key sent as a number is logged as wrong_type with no value", async (event) => {
      const f = fixtures(harness, event)[0]!;
      const props = (adapter.jsonSchemas()[event] as { properties?: Record<string, { enum?: unknown[] }> }).properties ?? {};
      const key = requiredKeys(event).find((k) => typeof f.payload[k] === "string" && !props[k]?.enum && !["session_id", "hook_event_name", "tool_name"].includes(k));
      if (!key) return;
      const body = variant(f, { [key]: 987654 }, `type-${event}`);
      const res = await hook.post(body);
      expect(res.status).toBe(200);
      const { entry, text } = await hook.logFor(body.session_id);
      expect(entry.wrong_type).toEqual([`${key}: expected string`]);
      expect(entry.missing).toEqual([]);
      expect(text).not.toContain("987654");
    });
  });

  describe(`contract[${harness}]: a value outside a closed set is reported, never rejected`, () => {
    const enumKeys = (event: string): string[] => {
      const props = (adapter.jsonSchemas()[event] as { properties?: Record<string, { enum?: unknown[] }> }).properties ?? {};
      return Object.keys(props).filter((k) => Array.isArray(props[k]!.enum));
    };
    test.each(events.map((e) => [e] as const))("%s: an unlisted value is logged as invalid_value without the value, and the answer stays 200", async (event) => {
      const seenKeys = new Set<string>();
      for (const f of fixtures(harness, event)) {
        for (const key of enumKeys(event).filter((k) => k in f.payload && !seenKeys.has(k))) {
          seenKeys.add(key);
          const bad = `SECRET-NOT-IN-THE-SET-${key}`;
          const body = variant(f, { [key]: bad }, `enum-${event}-${key}`);
          const res = await hook.post(body);
          expect(res.status).toBe(200);
          expectNeverBlocks(await res.json());
          const { entry } = await hook.logFor(body.session_id);
          expect(entry.wrong_type).toEqual([`${key}: invalid_value`]);
          expect(entry.missing).toEqual([]);
          const rest = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== bad));
          expect(JSON.stringify(rest)).not.toContain(bad);
        }
      }
      const withEnum = enumKeys(event).filter((k) => fixtures(harness, event).some((f) => k in f.payload));
      expect([...seenKeys].sort()).toEqual(withEnum.sort());
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
