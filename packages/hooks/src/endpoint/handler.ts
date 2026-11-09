import { handle, type HandleOptions, type Handled } from "../handle.ts";
import type { Pipeline } from "../core/pipeline.ts";
import type { HarnessAdapter } from "../port.ts";
import { createAdmission, type AdmissionConfig } from "./admission.ts";
import { DEFAULT_HARNESS, Failure, Header, HEALTH_PATH, HOOK_ROUTE, Reply, Status } from "./constants.ts";

/**
 * A web-standard request handler: what `Bun.serve`, `serveNode` or a test can all call. The handler itself imports `node:` modules,
 * so it needs a Node-compatible runtime (Node or Bun), not any web runtime.
 */
export type HookHandler = (req: Request) => Promise<Response>;

/** What `onHandled` receives after a hook was decoded, run through the pipeline and encoded. */
export interface HandledHook {
  payload: Record<string, unknown>;
  handled: Handled;
}

export interface HookHandlerOptions {
  adapters: ReadonlyMap<string, HarnessAdapter>;
  pipeline: Pipeline;
  admission: AdmissionConfig;
  /** Largest request body, in bytes, the handler reads; a larger one is answered 413. */
  maxBodyBytes: number;
  /** Called after each handled hook, before the reply is sent; a throw or a rejection is ignored. */
  onHandled?: (hook: HandledHook) => void | Promise<void>;
  /** Receives a decode, pipeline or encode failure from `handle`; silent when omitted. */
  onError?: HandleOptions["onError"];
}

const text = (body: string, status: number) => new Response(body, { status });

function pathOf(req: Request): string | null {
  try {
    return new URL(req.url).pathname;
  } catch {
    return null;
  }
}

const declaredLength = (req: Request): number => {
  const raw = req.headers.get(Header.ContentLength);
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : 0;
};

async function readCapped(req: Request, maxBytes: number): Promise<string | null> {
  if (declaredLength(req) > maxBytes) return null;
  if (req.body === null) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function readPayload(req: Request, maxBytes: number): Promise<Record<string, unknown> | Response> {
  const raw = await readCapped(req, maxBytes);
  if (raw === null) return text(Reply.PayloadTooLarge, Status.PayloadTooLarge);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return text(Reply.InvalidJson, Status.BadRequest);
  }
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : text(Reply.ExpectedObject, Status.BadRequest);
}

async function notify(onHandled: HookHandlerOptions["onHandled"], hook: HandledHook): Promise<void> {
  if (!onHandled) return;
  try {
    await onHandled(hook);
  } catch {
  }
}

/**
 * Builds the hook endpoint: `POST /hook[/<harness>]` decodes the payload with the named adapter (Claude when
 * omitted), runs the pipeline and answers the encoded reply; `GET /healthz` answers `ok`. Reads no environment and
 * writes no log; everything is an argument.
 */
export function createHookHandler(options: HookHandlerOptions): HookHandler {
  const { adapters, pipeline, maxBodyBytes, onHandled, onError } = options;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) throw new TypeError(Failure.MaxBodyBytes);
  const admit = createAdmission(options.admission);

  return async (req) => {
    const pathname = pathOf(req);
    if (pathname === null) return text(Reply.BadRequest, Status.BadRequest);
    if (pathname === HEALTH_PATH) return new Response(Reply.Ok);
    const route = HOOK_ROUTE.exec(pathname);
    if (!route) return text(Reply.NotFound, Status.NotFound);
    if (req.method !== "POST") return text(Reply.MethodNotAllowed, Status.MethodNotAllowed);

    const refused = admit(req);
    if (refused) return refused;

    const adapter = adapters.get(route[1] ?? DEFAULT_HARNESS);
    if (!adapter) return text(Reply.NotFound, Status.NotFound);

    const payload = await readPayload(req, maxBodyBytes);
    if (payload instanceof Response) return payload;

    const handled = await handle(adapter, payload, pipeline, { onError });
    void notify(onHandled, { payload, handled });
    return Response.json(handled.body);
  };
}
