import { describe, expect, test } from "bun:test";
import { AgentContractCheck, agentContract, fakeAgentEngine, type FakeAgentScript } from "../../../src/testing/index.ts";
import { fail, ok } from "../../../src/core/result.ts";
import type { AgentEvent, AgentOutput } from "../../../src/agent/types.ts";
import type { Defect } from "./support/reference-runtime.ts";
import { DENIED_TOOL, denyEvents, failing, normalEvents, subjectOf } from "./support/subjects.ts";

const ALL = Object.values(AgentContractCheck);

describe("agentContract on a faithful facet over the fake engine", () => {
  test("every check passes", async () => {
    const checks = await agentContract(subjectOf());
    expect(checks.filter((check) => !check.ok)).toEqual([]);
    expect(checks.map((check) => check.name)).toEqual(ALL);
  });

  test("a subject with only runtime, options and id fails the checks that need wiring and says what to supply", async () => {
    const checks = await agentContract(subjectOf({ bare: true }));
    const byName = new Map(checks.map((check) => [check.name, check]));
    for (const name of [AgentContractCheck.CancelCancelled, AgentContractCheck.DenyRefused, AgentContractCheck.ResumeMissRecovered, AgentContractCheck.ResumeMissRefused]) {
      expect(byName.get(name)?.ok).toBe(false);
      expect(byName.get(name)?.detail).toContain("supplies no scenario");
    }
    expect(byName.get(AgentContractCheck.DescribeNamesOnly)?.detail).toContain("no engine");
    expect(byName.get(AgentContractCheck.ClosedEnv)?.detail).toContain("no engine input recorder");
    expect(byName.get(AgentContractCheck.OneTerminalEvent)?.ok).toBe(true);
    expect(byName.get(AgentContractCheck.UsagePerMessage)?.ok).toBe(true);
  });
});

const DEFECTS: readonly (readonly [Defect, string[]])[] = [
  ["double-finished", [AgentContractCheck.OneTerminalEvent]],
  ["event-after-finished", [AgentContractCheck.EventsOrder]],
  ["no-started", [AgentContractCheck.EventsOrder]],
  ["settled-rejects", [AgentContractCheck.SettledNeverRejects]],
  ["settled-differs", [AgentContractCheck.SettledNeverRejects]],
  ["settled-before-terminal", [AgentContractCheck.SettledNeverRejects]],
  ["leak-key", [AgentContractCheck.NoSecretLeak]],
  ["inherits-ambient", [AgentContractCheck.ClosedEnv]],
  ["cancel-early", [AgentContractCheck.CancelCancelled]],
  ["cancel-wrong-kind", [AgentContractCheck.CancelCancelled]],
  ["cli-spawns", [AgentContractCheck.CliEngineUnsupported]],
  ["accepts-any-turns", [AgentContractCheck.MaxTurnsRequired]],
  ["recovers-without-prompt", [AgentContractCheck.ResumeMissRefused]],
  ["no-recovered-event", [AgentContractCheck.ResumeMissRecovered]],
  ["never-recovers", [AgentContractCheck.ResumeMissRecovered]],
];

describe("each check fails when its rule is broken by the facet", () => {
  for (const [defect, expected] of DEFECTS) {
    test(`${defect} fails ${expected.join(", ")}`, async () => {
      const names = await failing(subjectOf({ defects: [defect] }));
      for (const name of expected) expect(names).toContain(name);
    });
  }

  test("a defect leaves the checks it does not break passing", async () => {
    const doubled = await failing(subjectOf({ defects: ["double-finished"] }));
    for (const name of [AgentContractCheck.CliEngineUnsupported, AgentContractCheck.MaxTurnsRequired, AgentContractCheck.UsagePerMessage, AgentContractCheck.UsageNoPrice, AgentContractCheck.SessionEvent, AgentContractCheck.DenyRefused]) {
      expect(doubled).not.toContain(name);
    }
    expect(await failing(subjectOf({ defects: ["cli-spawns"] }))).toEqual([AgentContractCheck.CliEngineUnsupported]);
    expect(await failing(subjectOf({ defects: ["settled-rejects"] }))).toEqual([AgentContractCheck.SettledNeverRejects]);
  });
});

function without(events: AgentEvent[], kind: AgentEvent["kind"]): AgentEvent[] {
  return events.filter((event) => event.kind !== kind);
}

function usageWith(extra: Record<string, unknown>): AgentEvent[] {
  return normalEvents().map((event) => (event.kind === "usage" ? ({ ...event, ...extra } as AgentEvent) : event));
}

const SCRIPTS: readonly (readonly [string, FakeAgentScript[], string])[] = [
  ["usage events carrying a price", [{ events: usageWith({ costUsd: 0.5 }) }], AgentContractCheck.UsageNoPrice],
  ["no usage events", [{ events: without(normalEvents(), "usage") }], AgentContractCheck.UsagePerMessage],
  ["a usage turn that does not rise", [{ events: usageWith({ turn: 1 }) }], AgentContractCheck.UsagePerMessage],
  ["a negative usage count", [{ events: usageWith({ output: -1 }) }], AgentContractCheck.UsagePerMessage],
  [
    "fewer output usage entries than usage events",
    [{ events: normalEvents(), result: ok({ text: "ok", output: null, sessionId: null, checkpoint: null, turns: 2, usage: [], model: null } satisfies AgentOutput) }],
    AgentContractCheck.UsagePerMessage,
  ],
  ["no session event", [{ events: without(normalEvents(), "session") }], AgentContractCheck.SessionEvent],
  [
    "a session event without a checkpoint field",
    [{ events: normalEvents().map((event) => (event.kind === "session" ? ({ kind: "session", id: event.id } as unknown as AgentEvent) : event)) }],
    AgentContractCheck.SessionEvent,
  ],
  [
    "an output with a different session id",
    [{ events: normalEvents(), result: ok({ text: "ok", output: null, sessionId: "other" as never, checkpoint: null, turns: 2, usage: [{ turn: 1, model: null, input: 2, cacheWrite: 0, cacheRead: 0, output: 1 }, { turn: 2, model: null, input: 2, cacheWrite: 0, cacheRead: 0, output: 1 }], model: null }) }],
    AgentContractCheck.SessionEvent,
  ],
];

describe("each check fails when the engine breaks its rule", () => {
  for (const [name, scripts, expected] of SCRIPTS) {
    test(`${name} fails ${expected}`, async () => {
      const names = await failing(subjectOf({ base: () => scripts }));
      expect(names).toContain(expected);
    });
  }

  test("a deny with a prefixed tool name fails the deny check", async () => {
    expect(await failing(subjectOf({ deny: () => [{ events: denyEvents(`mcp__server__${DENIED_TOOL}`) }] }))).toContain(AgentContractCheck.DenyRefused);
  });

  test("a deny with a parenthesised rule fails the deny check", async () => {
    expect(await failing(subjectOf({ deny: () => [{ events: denyEvents(`${DENIED_TOOL}(rm -rf)`) }] }))).toContain(AgentContractCheck.DenyRefused);
  });

  test("a deny that never becomes a refused event fails the deny check", async () => {
    expect(await failing(subjectOf({ deny: () => [{ events: without(denyEvents(), "refused") }] }))).toContain(AgentContractCheck.DenyRefused);
  });

  test("a refused event from another source fails the deny check", async () => {
    expect(await failing(subjectOf({ deny: () => [{ events: denyEvents(DENIED_TOOL, "unknown-tool") }] }))).toContain(AgentContractCheck.DenyRefused);
  });

  test("a resume that recovers twice fails the recovery check", async () => {
    const miss = () => fail({ kind: "session-not-found" as const, message: "no", sessionId: "contract-resume-session" });
    const names = await failing(subjectOf({ resume: () => [{ events: [], result: miss() }, { events: [], result: miss() }, { events: normalEvents() }] }));
    expect(names).toContain(AgentContractCheck.ResumeMissRecovered);
  });

  test("a description that carries an env value fails the describe check", async () => {
    const engine = fakeAgentEngine("claude", []);
    const leaky = { ...engine, describe: (input: Parameters<typeof engine.describe>[0]) => {
      const planned = engine.describe(input);
      return planned.ok ? ok({ ...planned.value, options: { env: input.env } }) : planned;
    } };
    expect(await failing(subjectOf({ engine: leaky }))).toContain(AgentContractCheck.DescribeNamesOnly);
  });

  test("a description that throws fails the describe check and nothing else", async () => {
    const engine = fakeAgentEngine("claude", []);
    const broken = { ...engine, describe: () => { throw new Error("describe broke"); } };
    expect(await failing(subjectOf({ engine: broken }))).toEqual([AgentContractCheck.DescribeNamesOnly]);
  });
});
