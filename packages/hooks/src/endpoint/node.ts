import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Failure, Header, PLACEHOLDER_ORIGIN, Reply, Status } from "./constants.ts";
import { isSocketListen, type BoundAddress, type RunningEndpoint, type ServeOptions } from "./serve.ts";

const BODYLESS = new Set(["GET", "HEAD"]);

function headersOf(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

function bodyOf(req: IncomingMessage): ReadableStream<Uint8Array> {
  let open = true;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      req.on("data", (chunk: Buffer) => {
        if (!open) return;
        controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
        if ((controller.desiredSize ?? 0) <= 0) req.pause();
      });
      req.on("end", () => {
        if (open) controller.close();
      });
      req.on("error", (err) => {
        if (open) controller.error(err);
      });
    },
    pull() {
      req.resume();
    },
    cancel() {
      open = false;
      req.resume();
    },
  });
}

function requestOf(req: IncomingMessage): Request | null {
  let url: URL;
  try {
    url = new URL(req.url ?? "/", PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  const method = req.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers: headersOf(req) };
  if (!BODYLESS.has(method)) {
    init.body = bodyOf(req);
    init.duplex = "half";
  }
  return new Request(url.href, init);
}

async function respond(res: ServerResponse, response: Response, unconsumed: boolean): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  if (unconsumed) headers[Header.Connection] = "close";
  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, headers);
  res.end(body);
}

/**
 * Needs a Node-compatible runtime (Node or Bun): it binds `node:http`, so it is not for web-only runtimes such as workers.
 * Binds a handler to `node:http` on a TCP port or a unix socket. Request bodies are streamed into the handler,
 * which enforces its own size cap; a reply sent while the request body is still unread carries `Connection: close` and the connection is then destroyed.
 */
export function serveNode(options: ServeOptions): Promise<RunningEndpoint> {
  const { handler, listen } = options;
  const server = createServer((req, res) => {
    const request = requestOf(req);
    const answer = request === null ? Promise.resolve(new Response(Reply.BadRequest, { status: Status.BadRequest })) : handler(request);
    answer
      .catch(() => new Response(Reply.Internal, { status: Status.Internal }))
      .then((response) => {
        const unconsumed = !BODYLESS.has(req.method ?? "GET") && !req.readableEnded;
        if (unconsumed) res.once("finish", () => req.destroy());
        return respond(res, response, unconsumed);
      })
      .catch(() => res.destroy());
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    const onListening = () => {
      server.off("error", reject);
      const bound = server.address();
      let address: BoundAddress;
      if (isSocketListen(listen)) address = { socketPath: listen.socketPath };
      else if (bound !== null && typeof bound === "object") address = { host: (bound as AddressInfo).address, port: (bound as AddressInfo).port };
      else return reject(new Error(Failure.BadAddress));
      resolve({
        address,
        close: (closeOptions) =>
          new Promise<void>((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
            server.closeIdleConnections();
            if (closeOptions?.force) server.closeAllConnections();
          }),
      });
    };
    if (isSocketListen(listen)) server.listen({ path: listen.socketPath }, onListening);
    else if (typeof listen.port === "number" && listen.host) server.listen({ port: listen.port, host: listen.host }, onListening);
    else reject(new TypeError(Failure.NoListen));
  });
}
