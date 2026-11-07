import { ConfigError } from "./config.ts";
import type { Middleware } from "@homelab/harness-hooks";

/**
 * Loads the modules named in HOOK_MIDDLEWARE. Each default-exports a Middleware or an array of them. A module that cannot be
 * loaded, or exports anything else, is a ConfigError naming the file (the server then refuses to start), never a silent skip.
 */
export async function loadMiddleware(paths: readonly string[]): Promise<Middleware[]> {
  const layers: Middleware[] = [];
  for (const path of paths) {
    let exported: unknown;
    try {
      exported = (await import(path)).default;
    } catch (err) {
      throw new ConfigError(`HOOK_MIDDLEWARE: cannot load ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const list = Array.isArray(exported) ? exported : [exported];
    if (list.length === 0 || !list.every((m) => typeof m === "function")) {
      throw new ConfigError(`HOOK_MIDDLEWARE: ${path} must default-export a middleware function or a non-empty array of them`);
    }
    layers.push(...(list as Middleware[]));
  }
  return layers;
}
