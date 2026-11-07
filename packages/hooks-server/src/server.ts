// The hook server. `bun src/server.ts` reads the environment (see config.ts), builds the server and runs it until a signal.
import { ConfigError, ServerConfig } from "./config.ts";
import { adapters as allAdapters, Pipeline, policyLayer, type HarnessAdapter, type Middleware } from "@homelab/harness-hooks";
import { loadMiddleware } from "./middleware-loader.ts";
import { HookHandler } from "./http/hook-handler.ts";
import { installGracefulShutdown } from "./shutdown.ts";

/** Collects what a server needs, then `build()` makes it. Both inputs are required, so a half-configured server cannot be built. */
export class HookServerBuilder {
  #config: ServerConfig | undefined;
  #adapters: ReadonlyMap<string, HarnessAdapter> | undefined;
  readonly #middleware: Middleware[] = [];

  withConfig(config: ServerConfig): this {
    this.#config = config;
    return this;
  }

  /** The harnesses the server speaks, by id. A request for any other id is a 404. */
  withAdapters(adapters: ReadonlyMap<string, HarnessAdapter>): this {
    this.#adapters = adapters;
    return this;
  }

  /** Adds middleware, outermost first. The built-in policy always runs innermost, so these see and can change its reply. */
  use(...layers: Middleware[]): this {
    this.#middleware.push(...layers);
    return this;
  }

  build() {
    if (!this.#config || !this.#adapters) throw new Error("HookServerBuilder needs withConfig() and withAdapters() before build()");
    const config = this.#config;
    const pipeline = new Pipeline({ timeoutMs: config.middlewareTimeoutMs }).use(...this.#middleware, policyLayer);
    const handler = new HookHandler(config, this.#adapters, pipeline);
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
  let middleware: Middleware[];
  try {
    config = new ServerConfig(process.env);
    middleware = await loadMiddleware(config.middleware);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`harness-hooks: ${err.message}`);
    process.exit(2);
  }
  if (config.token === "") console.warn("HOOK_TOKEN is empty: auth disabled (loopback only)");
  const server = new HookServerBuilder().withConfig(config).withAdapters(allAdapters).use(...middleware).build();
  console.log(`harness-hooks listening on ${server.hostname}:${server.port}`);
  installGracefulShutdown(server, config.shutdownGraceMs);
}
