import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listFiles, newestFirst, statFiles, type Stamped } from "../../src/core/fs.ts";

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const jsonl = (name: string) => name.endsWith(".jsonl");
let root = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "adapters-core-fs-"));
  mkdirSync(join(root, "a", "b"), { recursive: true });
  mkdirSync(join(root, "skipme"));
  writeFileSync(join(root, "one.jsonl"), "{}\n");
  writeFileSync(join(root, "note.txt"), "x");
  writeFileSync(join(root, "a", "two.jsonl"), "{}\n");
  writeFileSync(join(root, "a", "b", "three.jsonl"), "{}\n");
  writeFileSync(join(root, "skipme", "hidden.jsonl"), "{}\n");
});

afterAll(() => {
  chmodSync(join(root, "locked"), 0o755);
  rmSync(root, { recursive: true, force: true });
});

describe("listFiles", () => {
  test("walks recursively, keeps accepted names, sorted by name", () => {
    expect(listFiles(root, jsonl, (path) => path.endsWith("skipme"))).toEqual([
      join(root, "a", "b", "three.jsonl"),
      join(root, "a", "two.jsonl"),
      join(root, "one.jsonl"),
    ]);
  });

  test("the skip predicate prunes a directory", () => {
    expect(listFiles(root, jsonl, () => true)).toEqual([join(root, "one.jsonl")]);
  });

  test("a missing directory gives no entries", () => {
    expect(listFiles(join(root, "missing"), jsonl)).toEqual([]);
  });

  test.skipIf(isRoot)("an unreadable directory is skipped, its siblings still listed", () => {
    const locked = join(root, "locked");
    mkdirSync(locked);
    writeFileSync(join(locked, "secret.jsonl"), "{}\n");
    chmodSync(locked, 0o000);
    try {
      expect(listFiles(root, jsonl, (path) => path.endsWith("skipme"))).toContain(join(root, "one.jsonl"));
      expect(listFiles(root, jsonl, (path) => path.endsWith("skipme"))).not.toContain(join(locked, "secret.jsonl"));
      expect(listFiles(locked, jsonl)).toEqual([]);
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});

describe("statFiles and newestFirst", () => {
  test("statFiles drops paths that cannot be stat'ed", () => {
    const real = join(root, "one.jsonl");
    const stamped = statFiles([real, join(root, "gone.jsonl")]);
    expect(stamped.map((file) => file.path)).toEqual([real]);
    expect(stamped[0]?.size).toBe(3);
  });

  test("newestFirst orders by mtime descending with path as the tie break", () => {
    const files: Stamped[] = [
      { path: "/c", mtimeMs: 10, size: 0 },
      { path: "/b", mtimeMs: 20, size: 0 },
      { path: "/a", mtimeMs: 10, size: 0 },
    ];
    expect(newestFirst(files).map((file) => file.path)).toEqual(["/b", "/a", "/c"]);
    expect(files.map((file) => file.path)).toEqual(["/c", "/b", "/a"]);
  });

  test("newestFirst on real mtimes puts the most recently touched file first", () => {
    const older = join(root, "one.jsonl");
    const newer = join(root, "a", "two.jsonl");
    utimesSync(older, 1_000, 1_000);
    utimesSync(newer, 2_000, 2_000);
    expect(newestFirst(statFiles([older, newer])).map((file) => file.path)).toEqual([newer, older]);
  });
});
