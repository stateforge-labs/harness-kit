import { describe, expect, test } from "bun:test";
import { CODEX_PROFILE } from "../../src/codex/profile.ts";
import { CodexCli } from "../../src/codex/constants.ts";
import { parseVersion } from "../../src/core/version.ts";
import { flagAppearsIn, readFixture, walkEvidence } from "../support/profile-walk.ts";

const HELP = readFixture("fixtures/codex/headless/help.txt");

describe("the Codex profile", () => {
  test("every measured fact has evidence and every open question ends with a question mark", () => {
    const tally = walkEvidence(CODEX_PROFILE);
    expect(tally.measured).toBeGreaterThan(0);
    expect(tally.unmeasured).toBe(3);
    expect(tally.suggested).toBe(0);
  });

  test("identity and the shipped nested environment", () => {
    expect(CODEX_PROFILE.id).toBe("codex");
    expect(CODEX_PROFILE.binary).toBe("codex");
    expect(CODEX_PROFILE.nestedEnv).toMatchObject({ state: "measured", value: [] });
  });

  test("every measured flag appears in the captured help", () => {
    expect(CODEX_PROFILE.cli.flags.state).toBe("measured");
    const flags = CODEX_PROFILE.cli.flags.state === "measured" ? CODEX_PROFILE.cli.flags.value : [];
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      expect({ flag, present: flagAppearsIn(flag, HELP) }).toEqual({ flag, present: true });
    }
  });

  test("the version fixture parses to the recorded harness version", () => {
    expect(parseVersion(readFixture("fixtures/codex/headless/version.txt"))).toBe("0.167.0");
    expect(CODEX_PROFILE.cli.versionArgs).toMatchObject({ state: "measured", value: [CodexCli.Version] });
  });

  test("no headless model suggestion and the effort values stay open", () => {
    expect(CODEX_PROFILE.suggested.headlessModel).toBeNull();
    expect(CODEX_PROFILE.effort.accepted.state).toBe("unmeasured");
  });

  test("the isolation home variable is CODEX_HOME", () => {
    expect(CODEX_PROFILE.isolation.homeVar).toMatchObject({ state: "measured", value: "CODEX_HOME" });
  });
});
