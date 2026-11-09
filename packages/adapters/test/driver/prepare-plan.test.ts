import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { PlanNote, PLACEHOLDER_OUT_FILE } from "../../src/driver/constants.ts";
import { FAKE_INJECT, FAKE_STRIP } from "../support/fake-driver.ts";
import { SENTINEL, valueOf } from "../support/credential.ts";
import { prep } from "../support/prepare.ts";

describe("plan", () => {
  test("env names only: inject holds the injected name, strip holds present names", () => {
    const plan = valueOf(prep()).plan;
    expect(plan.env.inject).toEqual([FAKE_INJECT]);
    expect(plan.env.strip).toEqual([FAKE_STRIP]);
    expect(plan.env.set).toEqual([]);
  });

  test("the args carry the out-file placeholder, not a real path", () => {
    const plan = valueOf(prep()).plan;
    if (plan.engine !== "cli") {
      throw new Error("expected a cli plan");
    }
    expect(plan.args).toContain(PLACEHOLDER_OUT_FILE);
    expect(plan.harness).toBe("fake");
    expect(plan.binary).toBe("fake-cli");
  });

  test("notes name argv exposure and env bytes, and a private cwd adds nothing to the env names", () => {
    expect(valueOf(prep()).plan.notes).toEqual([PlanNote.ArgvExposure, PlanNote.EnvBytesNotCounted]);
    const priv = valueOf(prep({ cwd: { private: "delete" } })).plan;
    expect(priv.cwd).toEqual({ kind: "private", retain: "delete" });
    expect(priv.env.set).toEqual([]);
  });

  test("the plan never contains the sentinel, in JSON or in inspect", () => {
    const prepared = valueOf(prep());
    expect(JSON.stringify(prepared.plan)).not.toContain(SENTINEL);
    expect(JSON.stringify(prepared)).not.toContain(SENTINEL);
    expect(inspect(prepared, { depth: 9 })).not.toContain(SENTINEL);
    expect(inspect(prepared.credentialPlan, { depth: 9 })).toContain("[secret]");
  });

  test("the controls expose the timeout and the plan options carry no removed fields", () => {
    const prepared = valueOf(prep({ timeoutMs: 7000 }));
    expect(prepared.controls.timeoutMs).toBe(7000);
    expect(Object.keys(prepared.plan.options).sort()).toEqual(["cwd", "effort", "limits", "maxArgvBytes", "model", "persist", "timeoutMs", "tools"]);
  });
});

describe("child env", () => {
  test("the secret is revealed only inside child.env", () => {
    const prepared = valueOf(prep());
    const child = prepared.childEnv();
    expect(child.env[FAKE_INJECT]).toBe(SENTINEL);
    expect(child.env[FAKE_STRIP]).toBeUndefined();
    expect(child.secrets).toEqual([SENTINEL]);
    expect(JSON.stringify(prepared.plan)).not.toContain(SENTINEL);
  });

  test("the child env never sets a home variable", () => {
    const child = valueOf(prep({ cwd: { private: "keep" } })).childEnv();
    expect(child.set).toEqual([]);
  });
});
