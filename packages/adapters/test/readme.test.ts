import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { CapabilityName, Engine, SupportState, type Support } from "../src/core/capability.ts";
import { RUN_FAILURE_KINDS } from "../src/core/failure.ts";
import { builtinDrivers } from "../src/drivers.ts";

const README = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
const QUICKSTART = readFileSync(fileURLToPath(new URL("../examples/quickstart.ts", import.meta.url)), "utf8");
const RUNTIME_IMPORT = '"../src/runtime/index.ts"';
const PUBLISHED_IMPORT = '"@stateforge-labs/harness-adapters/runtime"';
const COLUMNS: readonly (readonly [string, HarnessId])[] = [
  ["Claude", Harness.Claude],
  ["Codex", Harness.Codex],
  ["OpenCode", Harness.OpenCode],
];
const CELLS_START = "<!-- cells:start -->";
const CELLS_END = "<!-- cells:end -->";

function supportText(support: Support): string {
  switch (support.state) {
    case SupportState.Supported:
      return "supported";
    case SupportState.Emulated:
      return `emulated: ${support.how}`;
    case SupportState.Unsupported:
      return `unsupported: ${support.reason}`;
    case SupportState.Unmeasured:
      return `unmeasured: ${support.question}`;
  }
}

function renderCells(): string {
  const drivers = builtinDrivers();
  const header = `| Capability | ${COLUMNS.map(([label]) => label).join(" | ")} |`;
  const rule = `| --- | ${COLUMNS.map(() => "---").join(" | ")} |`;
  const rows = (Object.values(CapabilityName) as CapabilityName[]).map((name) => {
    const cells = COLUMNS.map(([, id]) => supportText(drivers[id].capabilities[name][Engine.Cli]));
    return `| \`${name}\` | ${cells.join(" | ")} |`;
  });
  return [header, rule, ...rows].join("\n");
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) {
    throw new Error(`missing marker ${start} or ${end}`);
  }
  return text.slice(from + start.length, to).trim();
}

function section(text: string, heading: string): string {
  const from = text.indexOf(`\n## ${heading}\n`);
  if (from < 0) {
    throw new Error(`missing heading ${heading}`);
  }
  const rest = text.slice(from + 1);
  const next = rest.indexOf("\n## ", heading.length + 4);
  return next < 0 ? rest : rest.slice(0, next);
}

function firstTsBlock(text: string): string {
  const match = /```ts\n([\s\S]*?)```/.exec(text);
  if (match === null || match[1] === undefined) {
    throw new Error("no ts block");
  }
  return match[1];
}

const REQUIRED_HEADINGS = [
  "Credentials and policy",
  "Quick start",
  "Tool and env policy",
  "Differences per harness",
  "Errors",
  "Lifecycle",
  "Stability tiers",
  "Residue",
  "Observability",
  "Orphans",
];

describe("README", () => {
  test("the Quick start block is the examples file with the published import", () => {
    const expected = QUICKSTART.trim().replace(RUNTIME_IMPORT, PUBLISHED_IMPORT);
    expect(firstTsBlock(section(README, "Quick start")).trim()).toBe(expected);
  });

  test("every required section heading exists", () => {
    for (const heading of REQUIRED_HEADINGS) {
      expect(README).toContain(`\n## ${heading}\n`);
    }
  });

  test("the Errors section names every run failure kind in backticks", () => {
    const errors = section(README, "Errors");
    for (const kind of RUN_FAILURE_KINDS) {
      expect(errors).toContain(`\`${kind}\``);
    }
  });

  test("the cell table equals the render from the built-in drivers", () => {
    expect(between(README, CELLS_START, CELLS_END)).toBe(renderCells());
  });
});
