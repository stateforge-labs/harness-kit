import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: codex PostModelRequest", () => {
  test("model, status and token counts are logged", async () => {
    const body = variant(fixture("PostModelRequest"));
    await hook.post(body);
    const { entry } = await hook.logFor(body.session_id);
    expect(entry).toMatchObject({ model: expect.any(String), status: "completed", has_error: false, total_tokens: expect.any(Number) });
  });

  test("a non-null error is reported as has_error and its text stays out of the log", async () => {
    const body = variant(fixture("PostModelRequest"), { status: "failed", error: "SECRET-ERROR-TEXT sk-abc" });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry).toMatchObject({ status: "failed", has_error: true });
    expect(text).not.toContain("SECRET-ERROR-TEXT");
  });
});
