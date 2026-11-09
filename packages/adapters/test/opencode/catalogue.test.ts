import { describe, expect, test, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapterEnv, type AdapterEnv } from "../../src/env.ts";
import { opencodeModelsFile, readOpencodeCatalogue } from "../../src/opencode/index.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const MODELS = join(adaptersFixtures, "opencode", "models.json");
const scratch = mkdtempSync(join(tmpdir(), "oc-catalogue-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const env = (overrides: Partial<AdapterEnv> = {}): AdapterEnv => ({ home: "/h/u", xdgDataHome: "/d", xdgCacheHome: "/cache", codexHome: "/c", ...overrides });

describe("opencodeModelsFile", () => {
  test("uses the cache home and the opencode folder", () => {
    expect(opencodeModelsFile(env())).toBe(join("/cache", "opencode", "models.json"));
  });

  test("defaults the cache home to the .cache folder under HOME", () => {
    expect(opencodeModelsFile(adapterEnv({ HOME: "/h/u" }))).toBe(join("/h/u", ".cache", "opencode", "models.json"));
  });

  test("XDG_CACHE_HOME overrides the default", () => {
    expect(opencodeModelsFile(adapterEnv({ HOME: "/h/u", XDG_CACHE_HOME: "/xdg" }))).toBe(join("/xdg", "opencode", "models.json"));
  });
});

describe("readOpencodeCatalogue on the captured catalogue shape", () => {
  const catalogue = readOpencodeCatalogue(MODELS);

  test("lists the providers in file order", () => {
    expect(catalogue?.providers()).toEqual(["anthropic", "opencode"]);
  });

  test("returns the context window of a model", () => {
    expect(catalogue?.contextWindow("anthropic", "claude-opus-5-5")).toBe(1_000_000);
    expect(catalogue?.contextWindow("anthropic", "claude-sonnet-5")).toBe(200_000);
    expect(catalogue?.contextWindow("opencode", "deepseek-v4.1-flash")).toBe(128_000);
  });

  test("a zero or missing limit, an absent model and an absent provider give null", () => {
    expect(catalogue?.contextWindow("anthropic", "claude-zero")).toBeNull();
    expect(catalogue?.contextWindow("anthropic", "claude-unsized")).toBeNull();
    expect(catalogue?.contextWindow("anthropic", "missing-model")).toBeNull();
    expect(catalogue?.contextWindow("missing-provider", "claude-opus-5-5")).toBeNull();
  });
});

describe("readOpencodeCatalogue on files it cannot use", () => {
  test("a missing file gives null", () => {
    expect(readOpencodeCatalogue(join(scratch, "absent.json"))).toBeNull();
  });

  test("a file that is not JSON gives null", () => {
    const path = join(scratch, "broken.json");
    writeFileSync(path, "{not json");
    expect(readOpencodeCatalogue(path)).toBeNull();
  });

  test("a JSON array gives null", () => {
    const path = join(scratch, "array.json");
    writeFileSync(path, "[]");
    expect(readOpencodeCatalogue(path)).toBeNull();
  });
});
