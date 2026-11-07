// The hook server. `bun src/server.ts` reads the environment (see config.ts), builds the server and runs it until a signal.
import { adapters as allAdapters } from "./adapters/index.ts";
import { ConfigError, ServerConfig } from "./config.ts";
import { HookHandler } from "./http/hook-handler.ts";
import type { HarnessAdapter } from "./port.ts";
import { installGracefulShutdown } from "./shutdown.ts";

/** Collects what a server needs, then `build()` makes it. Both inputs are required, so a half-configured server cannot be built. */
export class HookServerBuilder {
  #config: ServerConfig | undefined;
  #adapters: ReadonlyMap<string, HarnessAdapter> | undefined;

  withConfig(config: ServerConfig): this {
    this.#config = config;
    return this;
  }

  /** The harnesses the server speaks, by id. A request for any other id is a 404. */
  withAdapters(adapters: ReadonlyMap<string, HarnessAdapter>): this {
    this.#adapters = adapters;
    return this;
  }

  build() {
    if (!this.#config || !this.#adapters) throw new Error("HookServerBuilder needs withConfig() and withAdapters() before build()");
    const config = this.#config;
    const handler = new HookHandler(config, this.#adapters);
    return Bun.serve({
      port: config.port,
      hostname: config.host,
      maxRequestBodySize: config.maxBodyBytes,
      fetch: (req) => handler.handle(req),
    });
  }
}

if (import.meta.main) {
  let config: ServerConfig;
  try {
    config = new ServerConfig(process.env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`harness-hooks: ${err.message}`);
    process.exit(2);
  }
  if (config.token === "") console.warn("HOOK_TOKEN is empty: auth disabled (loopback only)");
  const server = new HookServerBuilder().withConfig(config).withAdapters(allAdapters).build();
  console.log(`harness-hooks listening on ${server.hostname}:${server.port}`);
  installGracefulShutdown(server, config.shutdownGraceMs);
}
