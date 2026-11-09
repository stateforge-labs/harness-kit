import { describe, expect, test } from "bun:test";
import { OPENCODE_PROFILE } from "../../src/opencode/profile.ts";
import { OpenCodeCli } from "../../src/opencode/constants.ts";
import { parseVersion } from "../../src/core/version.ts";
import { flagAppearsIn, readFixture, walkEvidence } from "../support/profile-walk.ts";

const HELP = readFixture("fixtures/opencode/headless/help.txt");

describe("the OpenCode profile", () => {
  test("every measured fact has evidence and every open question ends with a question mark", () => {
    const tally = walkEvidence(OPENCODE_PROFILE);
    expect(tally.measured).toBeGreaterThan(0);
    expect(tally.unmeasured).toBe(3);
    expect(tally.suggested).toBe(0);
  });

  test("identity and the shipped nested environment", () => {
    expect(OPENCODE_PROFILE.id).toBe("opencode");
    expect(OPENCODE_PROFILE.binary).toBe("opencode");
    expect(OPENCODE_PROFILE.nestedEnv).toMatchObject({ state: "measured", value: [] });
  });

  test("every measured flag appears in the captured help, including --standalone", () => {
    expect(OPENCODE_PROFILE.cli.flags.state).toBe("measured");
    const flags = OPENCODE_PROFILE.cli.flags.state === "measured" ? OPENCODE_PROFILE.cli.flags.value : [];
    expect(flags).toContain(OpenCodeCli.Standalone);
    for (const flag of flags) {
      expect({ flag, present: flagAppearsIn(flag, HELP) }).toEqual({ flag, present: true });
    }
  });

  test("the version fixture parses to the recorded harness version", () => {
    expect(parseVersion(readFixture("fixtures/opencode/headless/version.txt"))).toBe("2.2.6");
    expect(OPENCODE_PROFILE.cli.versionArgs).toMatchObject({ state: "measured", value: [OpenCodeCli.Version] });
  });

  test("the isolation home variable is probe evidence and credential injection stays open", () => {
    expect(OPENCODE_PROFILE.isolation.homeVar).toMatchObject({ state: "measured", value: "XDG_DATA_HOME", evidence: { kind: "probe" } });
    expect(OPENCODE_PROFILE.cli.credentialInjection.state).toBe("unmeasured");
  });
});
