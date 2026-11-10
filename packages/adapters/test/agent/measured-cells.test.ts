import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Harness } from "@stateforge-labs/harness-hooks";
import { HOOK_SUPPORT } from "../../src/agent/constants.ts";
import { CapabilityName, SupportState } from "../../src/core/capability.ts";
import { builtinDrivers } from "../../src/drivers.ts";

const DOCS = readFileSync(fileURLToPath(new URL("../../docs/agent.md", import.meta.url)), "utf8");
const HEADING = "## Capability cells and what was measured";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface Row {
  readonly names: readonly string[];
  readonly date: string;
  readonly evidence: string;
}

function measuredRows(): readonly Row[] {
  const from = DOCS.indexOf(HEADING);
  expect(from).toBeGreaterThan(-1);
  const rest = DOCS.slice(from + HEADING.length);
  const header = rest.indexOf("| Cell | Date | Measured by |");
  expect(header).toBeGreaterThan(-1);
  const lines = rest.slice(header).split("\n");
  const rows: Row[] = [];
  for (const line of lines.slice(2)) {
    if (!line.startsWith("|")) {
      break;
    }
    const columns = line.split("|").slice(1, -1).map((column) => column.trim());
    rows.push({ names: [...(columns[0] ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] as string), date: columns[1] ?? "", evidence: columns.slice(2).join("|") });
  }
  return rows;
}

function recordedNames(): ReadonlySet<string> {
  const names = new Set<string>();
  for (const row of measuredRows()) {
    if (DATE.test(row.date) && !Number.isNaN(Date.parse(row.date)) && row.evidence.length > 0) {
      row.names.forEach((name) => names.add(name));
    }
  }
  return names;
}

describe("the measured table of docs/agent.md", () => {
  test("every row carries a valid date and some evidence", () => {
    const rows = measuredRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(DATE.test(row.date)).toBe(true);
      expect(Number.isNaN(Date.parse(row.date))).toBe(false);
      expect(row.evidence.length).toBeGreaterThan(0);
    }
  });

  for (const [id, driver] of Object.entries(builtinDrivers())) {
    test(`${id}: every sdk cell marked supported has a dated row`, () => {
      const recorded = id === Harness.Claude ? recordedNames() : new Set<string>();
      const unrecorded = (Object.values(CapabilityName) as CapabilityName[]).filter((name) => driver.capabilities[name].sdk.state === SupportState.Supported && !recorded.has(name));
      expect(unrecorded).toEqual([]);
    });

    test(`${id}: every hook point marked supported has a dated row`, () => {
      const recorded = id === Harness.Claude ? recordedNames() : new Set<string>();
      const table = Object.hasOwn(HOOK_SUPPORT, id) ? HOOK_SUPPORT[id] : undefined;
      const unrecorded = Object.entries(table ?? {}).filter(([point, support]) => support.state === SupportState.Supported && !recorded.has(point)).map(([point]) => point);
      expect(unrecorded).toEqual([]);
    });
  }
});
