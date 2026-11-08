import type { ServerConfig } from "../config.ts";
import { Harness, handle, type HarnessAdapter, type Pipeline } from "@stateforge-labs/harness-hooks";
import { logEvent } from "../log.ts";
import { Admission } from "./admission.ts";

type Payload = Record<string, unknown>;

const HOOK_ROUTE = /^\/hook(?:\/([^/]+))?$/;
const DEFAULT_HARNESS = Harness.Claude;

const text = (body: string, status: number) => new Response(body, { status });

function pathOf(req: Request): string | null {
  try {
    return new URL(req.url).pathname;
  } catch {
    return null;
  }
}

export class HookHandler {
  readonly #config: ServerConfig;
  readonly #adapters: ReadonlyMap<string, HarnessAdapter>;
  readonly #admission: Admission;
  readonly #pipeline: Pipeline;

  constructor(config: ServerConfig, adapters: ReadonlyMap<string, HarnessAdapter>, pipeline: Pipeline) {
    this.#config = config;
    this.#adapters = adapters;
    this.#pipeline = pipeline;
    this.#admission = new Admission(config.token);
  }

  async handle(req: Request): Promise<Response> {
    const pathname = pathOf(req);
    if (pathname === null) return text("bad request", 400);
    if (pathname === "/healthz") return new Response("ok");
    const route = HOOK_ROUTE.exec(pathname);
    if (!route) return text("not found", 404);
    if (req.method !== "POST") return text("method not allowed", 405);

    const refused = this.#admission.check(req);
    if (refused) return refused;

    const adapter = this.#adapters.get(route[1] ?? DEFAULT_HARNESS);
    if (!adapter) return text("not found", 404);

    const payload = await this.#readPayload(req);
    if (payload instanceof Response) return payload;

    const handled = await handle(adapter, payload, this.#pipeline);
    void logEvent(this.#config.logFile, payload, handled, this.#config.logFullPayload, new Date().toISOString(), this.#config.logMaxBytes);
    return Response.json(handled.body);
  }

  async #readPayload(req: Request): Promise<Payload | Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return text("invalid JSON", 400);
    }
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Payload) : text("expected a JSON object", 400);
  }
}
