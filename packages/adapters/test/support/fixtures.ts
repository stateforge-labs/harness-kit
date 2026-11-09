import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fixturesDir } from "@stateforge-labs/harness-hooks";
import { obj, parseRow, type Row } from "../../src/core/rows.ts";

export const adaptersFixtures = join(import.meta.dir, "..", "..", "fixtures");

export function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return filesUnder(path, keep);
    }
    return keep(name) ? [path] : [];
  });
}

export function rowsOf(path: string): Row[] {
  return readFileSync(path, "utf8").split("\n").flatMap((line) => {
    const row = parseRow(line);
    return row === null ? [] : [row];
  });
}

export function hookRows(harness: string): Row[] {
  return filesUnder(join(fixturesDir, harness), (name) => name.endsWith(".json") && !name.endsWith(".expected.json") && !name.endsWith(".log.json")).map(
    (path) => obj(JSON.parse(readFileSync(path, "utf8"))),
  );
}
