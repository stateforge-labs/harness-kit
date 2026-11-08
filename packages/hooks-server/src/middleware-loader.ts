import { ConfigError } from "./config.ts";
import { EnvVar, type Middleware } from "@homelab/harness-hooks";

export async function loadMiddleware(paths: readonly string[]): Promise<Middleware[]> {
  const layers: Middleware[] = [];
  for (const path of paths) {
    let exported: unknown;
    try {
      exported = (await import(path)).default;
    } catch (err) {
      throw new ConfigError(`${EnvVar.HookMiddleware}: cannot load ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const list = Array.isArray(exported) ? exported : [exported];
    if (list.length === 0 || !list.every((m) => typeof m === "function")) {
      throw new ConfigError(`${EnvVar.HookMiddleware}: ${path} must default-export a middleware function or a non-empty array of them`);
    }
    layers.push(...(list as Middleware[]));
  }
  return layers;
}
