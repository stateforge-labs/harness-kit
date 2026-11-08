import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

const SECRET_MESSAGE = "TEAMMATE-SECRET-MESSAGE";

describe("e2e: TeammateIdle", () => {
  test("the log keeps the teammate, team, agent and mode fields", async () => {
    const body = variant(fixture("TeammateIdle"));
    await hook.post(body);
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.teammate_name).toBe("researcher");
    expect(entry.team_name).toBe("session-1a023d31");
    expect(entry.agent_id).toBe("aresearcher-071a9e0a4ead0b0a");
    expect(entry.agent_type).toBe("researcher");
    expect(entry.permission_mode).toBe("auto");
  });

  test("a payload without the deprecated team_name is answered 200 and not flagged as missing", async () => {
    const body = variant(fixture("TeammateIdle"), { team_name: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.team_name).toBeNull();
  });

  test("an extra message field is never written to the log", async () => {
    const body = variant(fixture("TeammateIdle"), { last_message: SECRET_MESSAGE });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    await hook.logFor(body.session_id);
    expect(await hook.logText()).not.toContain(SECRET_MESSAGE);
  });

  test("the response stays empty even when the payload asks to stop the teammate", async () => {
    const res = await hook.post(variant(fixture("TeammateIdle"), { continue: false, stopReason: "stop" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });
});
