import { describe, expect, test } from "bun:test";
import { CLAUDE_DRIVER } from "../../src/claude/driver.ts";
import { CODEX_DRIVER } from "../../src/codex/driver.ts";
import { buildRuntime } from "../../src/driver/create-runtime.ts";
import { OPENCODE_DRIVER } from "../../src/opencode/driver.ts";
import type { CredentialOf } from "../../src/core/credential.ts";
import { type Measured, MeasuredState } from "../../src/core/evidence.ts";
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
    expect(names).toHaveLength(7);
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
