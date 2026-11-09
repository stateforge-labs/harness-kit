import { describe, expect, test } from "bun:test";
import { CLAUDE_PROFILE } from "../../src/claude/profile.ts";
import { CLAUDE_NESTED_ENV } from "../../src/claude/launch.ts";
import { ClaudeCli } from "../../src/claude/constants.ts";
import { parseVersion } from "../../src/core/version.ts";
import { flagAppearsIn, readFixture, walkEvidence } from "../support/profile-walk.ts";

const HELP = readFixture("fixtures/claude/headless/help.txt");

describe("the Claude profile", () => {
  test("every measured fact has evidence and every open question ends with a question mark", () => {
    const tally = walkEvidence(CLAUDE_PROFILE);
    expect(tally.measured).toBeGreaterThan(0);
    expect(tally.unmeasured).toBe(2);
    expect(tally.suggested).toBe(1);
  });

  test("identity and the shipped nested environment", () => {
    expect(CLAUDE_PROFILE.id).toBe("claude");
    expect(CLAUDE_PROFILE.binary).toBe("claude");
    expect(CLAUDE_PROFILE.nestedEnv).toMatchObject({ state: "measured", value: CLAUDE_NESTED_ENV });
  });

  test("every measured flag except -p appears in the captured help, and -p is printed as --print", () => {
    expect(CLAUDE_PROFILE.cli.flags.state).toBe("measured");
    const flags = CLAUDE_PROFILE.cli.flags.state === "measured" ? CLAUDE_PROFILE.cli.flags.value : [];
    expect(flags).toContain(ClaudeCli.Print);
    expect(HELP).toContain("--print");
    for (const flag of flags.filter((name) => name !== ClaudeCli.Print)) {
      expect({ flag, present: flagAppearsIn(flag, HELP) }).toEqual({ flag, present: true });
    }
  });

  test("the effort levels equal the ones printed in the captured help", () => {
    const match = /^\s*--effort <level>.*\n\s+\(([^)]*)\)/mu.exec(HELP);
    const levels = match?.[1]?.split(", ") ?? [];
    expect(CLAUDE_PROFILE.effort.accepted).toMatchObject({ state: "measured", value: levels });
  });

  test("the version fixture parses to the recorded harness version", () => {
    expect(parseVersion(readFixture("fixtures/claude/headless/version.txt"))).toBe("2.1.319");
    expect(CLAUDE_PROFILE.cli.versionArgs).toMatchObject({ state: "measured", value: [ClaudeCli.Version] });
  });

  test("the headless model suggestion is recorded but not applied", () => {
    expect(CLAUDE_PROFILE.suggested.headlessModel).toMatchObject({ value: "haiku", applied: false });
  });

  test("the isolation home variable and credential injection", () => {
    expect(CLAUDE_PROFILE.isolation.homeVar).toMatchObject({ state: "measured", value: "CLAUDE_CONFIG_DIR" });
    expect(CLAUDE_PROFILE.cli.credentialInjection).toMatchObject({ state: "measured", value: true });
  });
});
