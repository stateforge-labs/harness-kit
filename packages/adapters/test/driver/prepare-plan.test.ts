import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { PlanNote, PLACEHOLDER_OUT_FILE } from "../../src/driver/constants.ts";
import { Hermetic, Isolation } from "../../src/core/run.ts";
import { FAKE_HOME, FAKE_INJECT, FAKE_STRIP } from "../support/fake-driver.ts";
import { SENTINEL, valueOf } from "../support/credential.ts";
import { prep } from "../support/prepare.ts";

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
    if (plan.engine !== "cli") {
      throw new Error("expected a cli plan");
    }
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

describe("child env", () => {
  test("the secret is revealed only inside child.env", () => {
    const prepared = valueOf(prep());
    const child = prepared.childEnv(null);
    expect(child.env[FAKE_INJECT]).toBe(SENTINEL);
    expect(child.env[FAKE_STRIP]).toBeUndefined();
    expect(child.secrets).toEqual([SENTINEL]);
    expect(JSON.stringify(prepared.plan)).not.toContain(SENTINEL);
  });

  test("the private home is set to the isolation directory", () => {
    const child = valueOf(prep({ isolation: { kind: Isolation.PrivateHome, retain: "keep" } })).childEnv(ISO);
    expect(child.env[FAKE_HOME]).toBe(ISO);
    expect(child.set).toEqual([FAKE_HOME]);
  });
});
