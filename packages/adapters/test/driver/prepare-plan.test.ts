import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { PlanNote, PLACEHOLDER_OUT_FILE } from "../../src/driver/constants.ts";
import { Hermetic, Isolation } from "../../src/core/run.ts";
import { FAKE_HOME, FAKE_INJECT, FAKE_STRIP } from "../support/fake-driver.ts";
import { ambientEnv, SENTINEL, valueOf } from "../support/credential.ts";
import { prep } from "../support/prepare.ts";

const OUT = "/scratch/out.txt";
const ISO = "/scratch/iso";

describe("plan", () => {
  test("env names only: inject holds the injected name, strip holds present names", () => {
    const plan = valueOf(prep()).plan;
    expect(plan.env.inject).toEqual([FAKE_INJECT]);
    expect(plan.env.strip).toEqual([FAKE_STRIP]);
    expect(plan.env.set).toEqual([]);
  });

  test("the args carry the out-file placeholder, not a real path", () => {
    const plan = valueOf(prep()).plan;
    expect(plan.args).toContain(PLACEHOLDER_OUT_FILE);
    expect(plan.harness).toBe("fake");
    expect(plan.binary).toBe("fake-cli");
  });

  test("notes name argv exposure, env bytes and the private-home gap", () => {
    expect(valueOf(prep()).plan.notes).toEqual([PlanNote.ArgvExposure, PlanNote.EnvBytesNotCounted]);
    const isolated = valueOf(prep({ isolation: { kind: Isolation.PrivateHome, retain: "delete" } })).plan;
    expect(isolated.notes).toContain(PlanNote.IsolationHeadlessUnmeasured);
    expect(isolated.env.set).toEqual([FAKE_HOME]);
  });

  test("the plan never contains the sentinel, in JSON or in inspect", () => {
    const prepared = valueOf(prep());
    expect(JSON.stringify(prepared.plan)).not.toContain(SENTINEL);
    expect(JSON.stringify(prepared)).not.toContain(SENTINEL);
    expect(inspect(prepared, { depth: 9 })).not.toContain(SENTINEL);
    expect(inspect(prepared.credentialPlan, { depth: 9 })).toContain("[secret]");
  });

  test("the controls expose the timeout and the acceptVersions", () => {
    const prepared = valueOf(prep({ timeoutMs: 7000, acceptVersions: ["1.0.0"] }));
    expect(prepared.controls.timeoutMs).toBe(7000);
    expect(prepared.controls.acceptVersions).toEqual(["1.0.0"]);
    expect(prepared.plan.options.hermetic).toBe(Hermetic.None);
  });
});

describe("build", () => {
  test("the secret is revealed only inside child.env", () => {
    const built = valueOf(valueOf(prep()).build({ outFile: OUT, isolationDir: null }));
    expect(built.child.env[FAKE_INJECT]).toBe(SENTINEL);
    expect(built.child.env[FAKE_STRIP]).toBeUndefined();
    expect(built.child.secrets).toEqual([SENTINEL]);
    expect(JSON.stringify(built.invocation)).not.toContain(SENTINEL);
    expect(inspect(built.invocation)).not.toContain(SENTINEL);
  });

  test("build replaces the placeholder with the real out-file", () => {
    const built = valueOf(valueOf(prep()).build({ outFile: OUT, isolationDir: null }));
    expect(built.invocation.args).toContain(OUT);
    expect(built.invocation.args).not.toContain(PLACEHOLDER_OUT_FILE);
    expect(built.invocation.outFile).toBe(OUT);
  });

  test("the private home is set to the isolation directory", () => {
    const built = valueOf(valueOf(prep({ isolation: { kind: Isolation.PrivateHome, retain: "keep" } })).build({ outFile: OUT, isolationDir: ISO }));
    expect(built.child.env[FAKE_HOME]).toBe(ISO);
    expect(built.child.set).toEqual([FAKE_HOME]);
  });

  test("an environment over the budget is too-large on the environment field", () => {
    const base = { ...ambientEnv([FAKE_STRIP], "/h/u"), BIG: "x".repeat(5000) };
    const result = valueOf(prep({}, {}, base)).build({ outFile: OUT, isolationDir: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toMatchObject({ kind: "too-large", field: "environment", limitBytes: 4096 });
    }
  });
});
