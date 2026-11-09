import { describe, expect, test } from "bun:test";
import { createDir, sweepDirs, tmpRoot } from "../../src/driver/isolation.ts";
import { CWD_PREFIX, SCRATCH_PREFIX, TMP_FALLBACK } from "../../src/driver/constants.ts";
import { EnvVar } from "../../src/env.ts";
import { fakeFs } from "../support/fakes.ts";

const NOW = 100_000;
const OLD = 0;
const YOUNG = NOW - 10;
const AGE = 1_000;

describe("tmpRoot", () => {
  test("uses TMPDIR when set and non-empty", () => {
    expect(tmpRoot({ [EnvVar.Tmpdir]: "/custom" })).toBe("/custom");
  });

  test("falls back when TMPDIR is missing or empty", () => {
    expect(tmpRoot({})).toBe(TMP_FALLBACK);
    expect(tmpRoot({ [EnvVar.Tmpdir]: "" })).toBe(TMP_FALLBACK);
  });
});

describe("createDir", () => {
  test("creates a directory under the temp root with the prefix", async () => {
    const fs = fakeFs();
    const path = await createDir(fs, { [EnvVar.Tmpdir]: "/work" }, CWD_PREFIX);
    expect(path).toBe(`/work/${CWD_PREFIX}1`);
    expect(fs.dirs.has(`/work/${CWD_PREFIX}1`)).toBe(true);
  });
});

describe("sweepDirs", () => {
  test("removes only old, owned directories and keeps the protected ones", async () => {
    const root = "/tmp-root";
    const fs = fakeFs({
      dirs: [
        root,
        { path: `${root}/${CWD_PREFIX}old`, mtimeMs: OLD },
        { path: `${root}/${SCRATCH_PREFIX}old`, mtimeMs: OLD },
        { path: `${root}/${CWD_PREFIX}kept`, mtimeMs: OLD },
        { path: `${root}/${CWD_PREFIX}young`, mtimeMs: YOUNG },
        { path: `${root}/unrelated`, mtimeMs: OLD },
      ],
      files: { [`${root}/${CWD_PREFIX}file`]: "x" },
    });
    const env = { [EnvVar.Tmpdir]: root };
    const removed = await sweepDirs(fs, env, NOW, AGE, new Set([`${root}/${CWD_PREFIX}kept`]));

    expect(removed).toBe(2);
    expect([...fs.removed].sort()).toEqual([`${root}/${CWD_PREFIX}old`, `${root}/${SCRATCH_PREFIX}old`].sort());
    expect(fs.dirs.has(`${root}/${CWD_PREFIX}kept`)).toBe(true);
    expect(fs.dirs.has(`${root}/${CWD_PREFIX}young`)).toBe(true);
    expect(fs.dirs.has(`${root}/unrelated`)).toBe(true);
  });

  test("returns zero when the temp root does not exist", async () => {
    const fs = fakeFs();
    expect(await sweepDirs(fs, { [EnvVar.Tmpdir]: "/missing" }, NOW, AGE, new Set())).toBe(0);
    expect(fs.removed).toEqual([]);
  });
});
