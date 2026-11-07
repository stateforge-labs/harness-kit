// What is special about Codex SessionStart: `transcript_path` is null in ephemeral runs and that is not a wrong type.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: codex SessionStart", () => {
  test("a null transcript_path is accepted without a wrong_type entry", async () => {
    const body = variant(fixture("SessionStart"), { transcript_path: null });
    expect((await hook.post(body)).status).toBe(200);
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.wrong_type).toEqual([]);
    expect(entry.missing).toEqual([]);
  });

  test("a numeric transcript_path is a wrong_type, still answered {}", async () => {
    const body = variant(fixture("SessionStart"), { transcript_path: 5 });
    const res = await hook.post(body);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.wrong_type).toEqual(["transcript_path: expected string"]);
  });
});
