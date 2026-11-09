import { describe, expect, test } from "bun:test";
import { CLAUDE_DRIVER } from "../../src/claude/driver.ts";
import { CODEX_DRIVER } from "../../src/codex/driver.ts";
import { buildRuntime } from "../../src/driver/create-runtime.ts";
import { OPENCODE_DRIVER } from "../../src/opencode/driver.ts";
import type { CredentialOf } from "../../src/core/credential.ts";
import { type Capabilities, CapabilityName, cell, Engine, supported, unmeasuredSupport } from "../../src/core/capability.ts";
import { type Measured, MeasuredState } from "../../src/core/evidence.ts";
import type { EngineImpl } from "../../src/driver/engine.ts";
import type { HarnessDriver } from "../../src/driver/port.ts";
import { fail, ok } from "../../src/core/result.ts";
import { secret } from "../../src/core/secret.ts";
import type { RunRequest } from "../../src/core/run.ts";
import { driverContract, type ContractCheck, type ContractFixtures } from "../../src/testing/index.ts";
import { FAKE_NESTED } from "../support/fake-driver.ts";
import { GATED_ID, gatedDriver } from "../support/gated-driver.ts";

const SENTINEL = "sk-CONTRACT-SENTINEL-4e1b";
const REQUEST: RunRequest = { instructions: "contract instructions", input: "contract input" };

function failingNames(checks: readonly ContractCheck[]): string[] {
  return checks.filter((check) => !check.ok).map((check) => check.name);
}

const CLAUDE_FIXTURES: ContractFixtures<"claude"> = {
  credentials: [
    { mode: "api-key", key: secret(SENTINEL) },
    { mode: "login-store", acknowledgePolicy: true },
    { mode: "token", token: secret(SENTINEL), acknowledgePolicy: true },
    { mode: "cloud", selector: "bedrock" },
  ],
  request: REQUEST,
  sentinels: [SENTINEL],
};

const CODEX_FIXTURES: ContractFixtures<"codex"> = {
  credentials: [{ mode: "api-key", key: secret(SENTINEL) }, { mode: "login-store" }],
  request: REQUEST,
  sentinels: [SENTINEL],
};

const OPENCODE_FIXTURES: ContractFixtures<"opencode"> = {
  credentials: [{ mode: "api-key", key: secret(SENTINEL), provider: "openai" }, { mode: "login-store" }],
  request: REQUEST,
  sentinels: [SENTINEL],
};

const GATED_FIXTURES: ContractFixtures<typeof GATED_ID> = {
  credentials: [{ mode: "api-key", key: secret(SENTINEL) } satisfies CredentialOf<typeof GATED_ID>],
  request: REQUEST,
  sentinels: [SENTINEL],
};

describe("driverContract on the shipped drivers", () => {
  test("claude has no failing checks", () => {
    expect(failingNames(driverContract(CLAUDE_DRIVER, CLAUDE_FIXTURES))).toEqual([]);
  });

  test("codex has no failing checks", () => {
    expect(failingNames(driverContract(CODEX_DRIVER, CODEX_FIXTURES))).toEqual([]);
  });

  test("opencode has no failing checks", () => {
    expect(failingNames(driverContract(OPENCODE_DRIVER, OPENCODE_FIXTURES))).toEqual([]);
  });

  test("reports one check per contract name", () => {
    const names = driverContract(CODEX_DRIVER, CODEX_FIXTURES).map((check) => check.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(9);
  });
});

describe("driverContract through buildRuntime", () => {
  test("a fourth driver with its own id has no failing checks", async () => {
    const runtime = buildRuntime({ [GATED_ID]: gatedDriver() }, {});
    const driver = runtime.driver(GATED_ID);
    expect(driver).not.toBeNull();
    if (driver === null) {
      return;
    }
    expect(failingNames(driverContract(driver, GATED_FIXTURES))).toEqual([]);
    await runtime.close();
  });
});

describe("driverContract on a deliberately broken driver", () => {
  test("a measured cell without evidence fails exactly the profile-evidence check", () => {
    const lacking = { state: MeasuredState.Measured, value: [FAKE_NESTED] } as unknown as Measured<readonly string[]>;
    const healthy = gatedDriver();
    const broken = { ...healthy, profile: { ...healthy.profile, nestedEnv: lacking } };
    expect(failingNames(driverContract(broken, GATED_FIXTURES))).toEqual(["profile-evidence"]);
  });
});

function gatedWith(caps: Partial<Capabilities>): HarnessDriver<typeof GATED_ID> {
  const healthy = gatedDriver();
  return { ...healthy, capabilities: { ...healthy.capabilities, ...caps } };
}

function detailOf(checks: readonly ContractCheck[], name: string): string {
  return checks.find((check) => check.name === name)?.detail ?? "";
}

function refusing(driver: HarnessDriver<typeof GATED_ID>, capability: CapabilityName): HarnessDriver<typeof GATED_ID> {
  const engine: EngineImpl<typeof GATED_ID> = {
    start: driver.run.cli.start,
    describe: (): ReturnType<NonNullable<EngineImpl<typeof GATED_ID>["describe"]>> =>
      fail({ kind: "unsupported", message: "engine refuses", capability, engine: Engine.Cli, why: "test" }),
  };
  return { ...driver, run: { engines: [Engine.Cli], cli: engine } };
}

describe("driverContract on the capability table", () => {
  test("a driver with a missing sdk cell fails capability-cells and names the cell", () => {
    const healthy = gatedDriver();
    const effort = { [Engine.Cli]: supported } as unknown as Capabilities[typeof CapabilityName.Effort];
    const broken = gatedWith({ [CapabilityName.Effort]: effort });
    const checks = driverContract(broken, GATED_FIXTURES);
    expect(failingNames(checks)).toEqual(["capability-cells"]);
    expect(detailOf(checks, "capability-cells")).toContain("effort.sdk");
    expect(failingNames(driverContract(healthy, GATED_FIXTURES))).toEqual([]);
  });

  test("an unmeasured sdk cell without a question fails capability-cells", () => {
    const bad = { [Engine.Cli]: supported, [Engine.Sdk]: { state: "unmeasured", question: "no mark" } } as Capabilities[typeof CapabilityName.Effort];
    const checks = driverContract(gatedWith({ [CapabilityName.Effort]: bad }), GATED_FIXTURES);
    expect(failingNames(checks)).toEqual(["capability-cells"]);
    expect(detailOf(checks, "capability-cells")).toContain("effort.sdk");
  });

  test("a usable sdk cell fails sdk-column and names the cell", () => {
    const usable = cell(supported, supported);
    const checks = driverContract(gatedWith({ [CapabilityName.ClosedEnv]: usable }), GATED_FIXTURES);
    expect(failingNames(checks)).toEqual(["sdk-column"]);
    expect(detailOf(checks, "sdk-column")).toContain("closed-env.sdk");
  });

  test("an unmeasured cli cell without a question fails capability-cells", () => {
    const bad = cell({ state: "unmeasured", question: "no mark" });
    expect(failingNames(driverContract(gatedWith({ [CapabilityName.BaseUrl]: bad }), GATED_FIXTURES))).toEqual(["capability-cells"]);
  });
});

describe("driverContract gating", () => {
  test("a cell that says supported while the engine refuses fails support-behaviour", () => {
    const broken = refusing(gatedDriver(), CapabilityName.Effort);
    const checks = driverContract(broken, GATED_FIXTURES);
    expect(failingNames(checks)).toEqual(["support-behaviour"]);
    expect(detailOf(checks, "support-behaviour")).toContain("effort");
  });

  test("a supported tools cell the engine refuses fails gating and names the cell", () => {
    const broken = refusing(gatedDriver(), CapabilityName.BuiltinToolsOff);
    const checks = driverContract(broken, GATED_FIXTURES);
    expect(failingNames(checks)).toContain("gating");
    expect(detailOf(checks, "gating")).toContain("builtin-tools-off");
  });

  test("emulated, unmeasured and unsupported tools cells all pass the confinement gate", () => {
    const caps = {
      [CapabilityName.BuiltinToolsOff]: cell({ state: "emulated", how: "read-only sandbox" }),
      [CapabilityName.McpNone]: cell(unmeasuredSupport("does it hold?")),
      [CapabilityName.SettingsSources]: cell({ state: "unsupported", reason: "harness-limit" }),
    };
    expect(detailOf(driverContract(gatedWith(caps), GATED_FIXTURES), "gating")).toBe("ok");
  });
});

describe("driverContract on an engine that is not a process", () => {
  test("an in-memory engine with no argv and no hooks has no failing checks", () => {
    const memory: EngineImpl<typeof GATED_ID> = {
      start: () => ({ events: (async function* () {})(), cancel: () => {}, done: Promise.resolve(ok({ exit: { code: 0, signal: null }, stderrTail: "" })) }),
    };
    const driver = { ...gatedDriver(), run: { engines: [Engine.Cli], cli: memory } };
    expect(failingNames(driverContract(driver, GATED_FIXTURES))).toEqual([]);
  });
});
