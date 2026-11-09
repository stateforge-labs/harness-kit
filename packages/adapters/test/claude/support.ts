import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_NESTED_ENV } from "../../src/claude/launch.ts";
import type { CredentialPlan, CredentialPlanInput } from "../../src/core/credential-plan.ts";
import { buildChildEnv, type EnvBase } from "../../src/driver/env-plan.ts";
import { EnvVar, type EnvSource } from "../../src/env.ts";
import { adaptersFixtures, filesUnder } from "../support/fixtures.ts";

export const claudePlanInput = (credential: unknown, env: EnvSource): CredentialPlanInput<"claude"> =>
  ({ credential, isolation: { kind: "none" }, env }) as unknown as CredentialPlanInput<"claude">;

export const claudeChildEnv = (base: EnvBase, plan: CredentialPlan) =>
  buildChildEnv({ base, plan, nestedEnv: CLAUDE_NESTED_ENV, homeVar: EnvVar.ClaudeConfigDir, isolationDir: null });

export const transcriptsRoot = join(adaptersFixtures, "claude", "projects");

export const transcriptFiles = (): string[] => filesUnder(transcriptsRoot, (name) => name.endsWith(".jsonl"));

export const linesOf = (path: string): string[] => readFileSync(path, "utf8").split("\n");

export const fixtureFile = (...parts: string[]): string => join(transcriptsRoot, ...parts);

export const BACKGROUND = fixtureFile("-home-user-proj-6", "00000000-0000-4000-8000-00000000008b.jsonl");
export const COMPACT = fixtureFile("-home-user-proj-2", "00000000-0000-4000-8000-000000000031.jsonl");
export const PASTED = fixtureFile("-home-user-proj-4", "00000000-0000-4000-8000-000000000065.jsonl");
export const SIDECHAIN = fixtureFile("-home-user", "00000000-0000-4000-8000-000000000196", "subagents", "agent-a0000000000000001.jsonl");

export const spaced = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(spaced).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).map(([key, inner]) => `${JSON.stringify(key)}: ${spaced(inner)}`).join(", ")}}`;
  }
  return JSON.stringify(value);
};

export const respaced = (lines: readonly string[]): string[] =>
  lines.map((line) => (line.trim() === "" ? line : spaced(JSON.parse(line))));
