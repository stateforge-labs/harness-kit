import { readFileSync } from "node:fs";
import { join } from "node:path";
import { obj, type Row } from "../core/rows.ts";
import { adapterEnv, type AdapterEnv } from "../env.ts";
import { OpenCodeDir, OpenCodeField } from "./constants.ts";

export interface OpenCodeCatalogue {
  contextWindow(provider: string, model: string): number | null;
  providers(): readonly string[];
}

export function opencodeModelsFile(env: AdapterEnv = adapterEnv()): string {
  return join(env.xdgCacheHome, OpenCodeDir.Cache, OpenCodeDir.Models);
}

const positive = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

const contextOf = (providers: Row, provider: string, model: string): number | null => {
  const entry = obj(obj(obj(providers[provider])[OpenCodeField.Models])[model]);
  return positive(obj(entry[OpenCodeField.Limit])[OpenCodeField.Context]);
};

export function readOpencodeCatalogue(path: string): OpenCodeCatalogue | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const providers = obj(parsed);
  return {
    contextWindow: (provider, model) => contextOf(providers, provider, model),
    providers: () => Object.keys(providers),
  };
}
