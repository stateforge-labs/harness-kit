import { ConfigError, ServerConfig } from "./config.ts";
import { adapters as allAdapters, EnvVar, Pipeline, policyLayer, WORKTREE_TIMEOUT_MS, worktreeLayer, type HarnessAdapter, type Middleware } from "@stateforge-labs/harness-hooks";
import { loadMiddleware } from "./middleware-loader.ts";
import { HookHandler } from "./http/hook-handler.ts";
import { installGracefulShutdown } from "./shutdown.ts";

export class HookServerBuilder {
  #config: ServerConfig | undefined;
  #adapters: ReadonlyMap<string, HarnessAdapter> | undefined;
  readonly #middleware: Middleware[] = [];

  withConfig(config: ServerConfig): this {
    this.#config = config;
    return this;
  }

  withAdapters(adapters: ReadonlyMap<string, HarnessAdapter>): this {
    this.#adapters = adapters;
    return this;
  }

  use(...layers: Middleware[]): this {
    this.#middleware.push(...layers);
    return this;
  }

  build() {
    if (!this.#config || !this.#adapters) throw new Error("HookServerBuilder needs withConfig() and withAdapters() before build()");
    const config = this.#config;
    const pipeline = new Pipeline({ timeoutMs: config.middlewareTimeoutMs, onFault: (message) => console.error(message) })
      .use(...this.#middleware)
      .use(worktreeLayer, { timeoutMs: WORKTREE_TIMEOUT_MS })
      .use(policyLayer);
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
    config = new ServerConfig();
    middleware = await loadMiddleware(config.middleware);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`harness-hooks: ${err.message}`);
    process.exit(2);
  }
  if (config.token === "") console.warn(`${EnvVar.HookToken} is empty: auth disabled (loopback only)`);
  const server = new HookServerBuilder().withConfig(config).withAdapters(allAdapters).use(...middleware).build();
  console.log(`harness-hooks listening on ${server.hostname}:${server.port}`);
  installGracefulShutdown(server, config.shutdownGraceMs);
}
