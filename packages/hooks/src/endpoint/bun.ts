import { Failure } from "./constants.ts";
import { isSocketListen, type RunningEndpoint, type ServeOptions } from "./serve.ts";

interface BunServer {
  readonly hostname?: string;
  readonly port?: number;
  stop(force?: boolean): Promise<void>;
}

interface BunServeOptions {
  fetch(req: Request): Promise<Response>;
  port?: number;
  hostname?: string;
  unix?: string;
  maxRequestBodySize?: number;
}

interface BunRuntime {
  serve(options: BunServeOptions): BunServer;
}

export interface ServeBunOptions extends ServeOptions {
  /** Passed to Bun as `maxRequestBodySize`, so an oversize body is refused before it is buffered; use the handler's cap. */
  maxBodyBytes?: number;
}

/**
 * Binds a handler to `Bun.serve` on a TCP port or a unix socket. Looks the runtime up on `globalThis` when called, so
 * importing this module is harmless on Node; calling it there throws.
 */
export async function serveBun(options: ServeBunOptions): Promise<RunningEndpoint> {
  const runtime = (globalThis as { Bun?: BunRuntime }).Bun;
  if (!runtime) throw new Error(Failure.NoBun);
  const { handler, listen, maxBodyBytes } = options;
  const common = { fetch: handler, ...(maxBodyBytes === undefined ? {} : { maxRequestBodySize: maxBodyBytes }) };
  const server = runtime.serve(isSocketListen(listen) ? { ...common, unix: listen.socketPath } : { ...common, port: listen.port, hostname: listen.host });
  return {
    address: isSocketListen(listen) ? { socketPath: listen.socketPath } : { host: server.hostname ?? listen.host, port: server.port ?? listen.port },
    close: (closeOptions) => server.stop(closeOptions?.force === true),
  };
}
