import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OPENCODE_BINARY,
  OPENCODE_TOOLLESS_CONFIG,
  opencodeArgs,
  opencodeToollessEnv,
  opencodeSessionDeleteArgs,
  opencodeSessionListArgs,
  parseOpencodeStream,
  parseSessionList,
  readOpencodeStream,
} from "../../src/opencode/launch.ts";
import { EnvVar } from "../../src/env.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const headless = join(adaptersFixtures, "opencode", "headless");
const synthetic = join(adaptersFixtures, "opencode", "synthetic");
const runHelp = readFileSync(join(headless, "help.txt"), "utf8");
const sessionHelp = readFileSync(join(headless, "session-help.txt"), "utf8");
const read = (dir: string, name: string): string => readFileSync(join(dir, name), "utf8");

describe("opencodeArgs", () => {
  test("builds the run argv with the model when given", () => {
    expect(opencodeArgs({ model: "provider/model", title: "recap" })).toEqual([
      "run",
      "--format",
      "json",
      "--title",
      "recap",
      "-m",
      "provider/model",
    ]);
  });

  test("omits the model flag when empty", () => {
    expect(opencodeArgs({ model: "", title: "recap" })).toEqual(["run", "--format", "json", "--title", "recap"]);
  });

  test("every emitted flag appears in the captured run help", () => {
    for (const flag of opencodeArgs({ model: "p/m", title: "t" }).filter((token) => token.startsWith("-"))) {
      expect(runHelp).toContain(flag);
    }
  });

  test("binary name", () => {
    expect(OPENCODE_BINARY).toBe("opencode");
  });
});

describe("opencodeToollessEnv", () => {
  test("sets the tool-less config under OPENCODE_CONFIG_CONTENT", () => {
    const env = opencodeToollessEnv();
    expect(Object.keys(env)).toEqual([EnvVar.OpenCodeConfigContent]);
    const config = env[EnvVar.OpenCodeConfigContent];
    const parsed = JSON.parse(config ?? "null") as { permissions: { action: string; resource: string; effect: string }[] };
    expect(parsed.permissions.length).toBeGreaterThan(0);
    expect(parsed.permissions.every((rule) => rule.resource === "*" && rule.effect === "deny")).toBe(true);
    expect(Object.keys(parsed)).toEqual(["permissions"]);
    expect(config).toBe(OPENCODE_TOOLLESS_CONFIG);
  });
});

describe("session argv", () => {
  test("list and delete argv", () => {
    expect(opencodeSessionListArgs()).toEqual(["session", "list", "--standalone", "--format", "json"]);
    expect(opencodeSessionDeleteArgs("ses_1")).toEqual(["session", "delete", "--standalone", "ses_1"]);
  });

  test("every emitted session flag appears in the captured session help", () => {
    for (const flag of [...opencodeSessionListArgs(), ...opencodeSessionDeleteArgs("x")].filter((token) => token.startsWith("-"))) {
      expect(sessionHelp).toContain(flag);
    }
  });
});

describe("readOpencodeStream and parseOpencodeStream", () => {
  test("synthetic success stream yields text, cost and session", () => {
    const stdout = read(synthetic, "stream.jsonl");
    expect(parseOpencodeStream(stdout)).toEqual({ text: "ok", cost: 0.0012, session: "ses_00000000000000000000000002" });
  });

  test("captured error stream yields no text and the captured session", () => {
    const stdout = read(headless, "opencode-stream.jsonl");
    const reading = readOpencodeStream(stdout);
    expect(reading.text).toBe("");
    expect(reading.cost).toBe(0);
    expect(reading.session).toBe("ses_00000000000000000000000001");
    expect(reading.unknown.byType.size).toBe(0);
  });

  test("unknown event types and non-JSON lines are counted, not parsed", () => {
    const stdout = ['{"type":"mystery","sessionID":"ses_x"}', "not json", '{"text":"no type"}', ""].join("\n");
    const reading = readOpencodeStream(stdout);
    expect(reading.text).toBe("");
    expect(reading.session).toBeNull();
    expect(reading.unknown.byType).toEqual(new Map([
      ["mystery", 1],
      ["(not-json)", 1],
      ["(untyped)", 1],
    ]));
  });
});

describe("parseSessionList", () => {
  test("reads the captured session list", () => {
    expect(parseSessionList(read(headless, "session-list.json"))).toEqual([{ id: "ses_00000000000000000000000001", title: "throwaway-capture" }]);
  });

  test("skips rows without string id and title, and returns [] for non-arrays", () => {
    const json = JSON.stringify([{ id: "a", title: "A" }, { id: 1, title: "B" }, { id: "c" }, "x", null]);
    expect(parseSessionList(json)).toEqual([{ id: "a", title: "A" }]);
    expect(parseSessionList(JSON.stringify({ id: "a", title: "A" }))).toEqual([]);
    expect(parseSessionList("not json")).toEqual([]);
  });
});
