import type { HookHandler } from "./handler.ts";

/** Where a binder listens: a TCP port on a host, or a unix domain socket path. */
export type Listen = { port: number; host: string } | { socketPath: string };

/** Where a running endpoint actually listens; `port` is the real one when `0` was asked for. */
export type BoundAddress = { host: string; port: number } | { socketPath: string };

export interface ServeOptions {
  handler: HookHandler;
  listen: Listen;
}

export interface CloseOptions {
  /** Drop connections that are still answering instead of waiting for them. */
  force?: boolean;
}

export interface RunningEndpoint {
  readonly address: BoundAddress;
  /** Stops accepting, waits for in-flight requests (unless forced) and frees the port or removes the socket. */
  close(options?: CloseOptions): Promise<void>;
}

export const isSocketListen = (listen: Listen): listen is { socketPath: string } => "socketPath" in listen;
