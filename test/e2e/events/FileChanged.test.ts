// What is special about FileChanged. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const TOKEN = "t0k3n";
const hook = hookServer({ HOOK_TOKEN: TOKEN });

describe("e2e: FileChanged", () => {
  test("the log line is known, has no missing keys, and carries only the change kind", async () => {
    const SECRET = "SECRET-FILE-BODY-TEXT";
    const body = variant(fixture("FileChanged"), { file_path: "/work/proj/.env", event: "add", tool_response: SECRET });
    const res = await hook.post(body, { token: TOKEN });
    expect(res.status).toBe(200);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.change).toBe("add");
    expect(entry.event).toBe("FileChanged");
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("/work/proj/.env");
  });

  test("a payload missing a required key is still answered 200 and logged as missing", async () => {
    const body = variant(fixture("FileChanged"), { file_path: undefined, event: "unlink" });
    const res = await hook.post(body, { token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["file_path"]);
  });

  test("the change fixture is logged known with no missing keys and the change kind recorded", async () => {
    const body = variant(fixture("FileChanged"));
    const res = await hook.post(body, { token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.change).toBe("change");
  });
});
