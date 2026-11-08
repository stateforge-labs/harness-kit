import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";
import { EnvVar } from "@stateforge-labs/harness-hooks";

const TOKEN = "t0k3n";
const hook = hookServer({ [EnvVar.HookToken]: TOKEN });

describe("e2e: CwdChanged", () => {
  test("the log line is known, has no missing keys, and no paths or prompt text", async () => {
    const secretDir = "SECRET-DIR-NAME";
    const body = variant(fixture("CwdChanged"), { old_cwd: `/home/dev/${secretDir}`, prompt: "SECRET-PROMPT-TEXT" });
    await hook.post(body, { token: TOKEN });
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("CwdChanged");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(text).not.toContain(secretDir);
    expect(text).not.toContain("SECRET-PROMPT-TEXT");
  });

  test("a payload missing new_cwd is still answered 200 and logged with it as missing", async () => {
    const body = variant(fixture("CwdChanged"), { new_cwd: undefined });
    const res = await hook.post(body, { token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["new_cwd"]);
  });
});
