import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { MASKED_HEADERS, MessagesApi } from "./agent-constants.ts";

/** One request the scripted server saw. The key headers are replaced by a fixed marker. */
export interface ScriptedRequest {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** A running scripted Messages API on 127.0.0.1. */
export interface ScriptedMessagesApi {
  readonly baseUrl: string;
  readonly requests: readonly ScriptedRequest[];
  close(): Promise<void>;
}

/** Token counts for the stream builders below. */
export interface ScriptedUsage {
  readonly input?: number;
  readonly cacheWrite?: number;
  readonly cacheRead?: number;
  readonly output?: number;
}

function maskedHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    out[name] = MASKED_HEADERS.includes(name) ? MessagesApi.Masked : Array.isArray(value) ? value.join(MessagesApi.Joiner) : value;
  }
  return out;
}

function frame(event: unknown): string {
  const type = typeof event === "object" && event !== null ? Reflect.get(event, "type") : undefined;
  return `${MessagesApi.EventPrefix}${typeof type === "string" ? type : MessagesApi.Ping}${MessagesApi.Newline}${MessagesApi.DataPrefix}${JSON.stringify(event)}${MessagesApi.Terminator}`;
}

function messageStart(model: string, usage: ScriptedUsage | undefined): unknown {
  return {
    type: MessagesApi.MessageStart,
    message: {
      id: MessagesApi.MessageId,
      type: MessagesApi.MessageType,
      role: MessagesApi.Role,
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: usage?.input ?? MessagesApi.InputTokens,
        cache_creation_input_tokens: usage?.cacheWrite ?? MessagesApi.CacheWriteTokens,
        cache_read_input_tokens: usage?.cacheRead ?? MessagesApi.CacheReadTokens,
        output_tokens: 1,
      },
    },
  };
}

function messageEnd(stop: string, usage: ScriptedUsage | undefined): readonly unknown[] {
  return [
    { type: MessagesApi.BlockStop, index: 0 },
    { type: MessagesApi.MessageDelta, delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: usage?.output ?? MessagesApi.OutputTokens } },
    { type: MessagesApi.MessageStop },
  ];
}

/** The Messages API stream events of one assistant message that says `text` and ends the turn. */
export function messagesTextStream(text: string, usage?: ScriptedUsage, model: string = MessagesApi.DefaultModel): readonly unknown[] {
  return [
    messageStart(model, usage),
    { type: MessagesApi.BlockStart, index: 0, content_block: { type: MessagesApi.TextBlock, text: "" } },
    { type: MessagesApi.BlockDelta, index: 0, delta: { type: MessagesApi.TextDelta, text } },
    ...messageEnd(MessagesApi.EndTurn, usage),
  ];
}

/** The Messages API stream events of one assistant message that calls a tool and stops for its result. */
export function messagesToolUseStream(name: string, input: unknown, usage?: ScriptedUsage, model: string = MessagesApi.DefaultModel): readonly unknown[] {
  return [
    messageStart(model, usage),
    { type: MessagesApi.BlockStart, index: 0, content_block: { type: MessagesApi.ToolUse, id: MessagesApi.ToolUseId, name, input: {} } },
    { type: MessagesApi.BlockDelta, index: 0, delta: { type: MessagesApi.InputJsonDelta, partial_json: JSON.stringify(input) } },
    ...messageEnd(MessagesApi.ToolUse, usage),
  ];
}

/** A local server on 127.0.0.1 that answers POST /v1/messages with the scripted stream as server-sent events. It records the path and headers of every request, with the key headers masked. Node `http` only. */
export function scriptedMessagesApi(script: readonly unknown[]): Promise<ScriptedMessagesApi> {
  const requests: ScriptedRequest[] = [];
  const server = createServer((req, res) => {
    const path = req.url ?? "";
    requests.push({ path, headers: maskedHeaders(req.headers) });
    req.resume();
    req.on("end", () => {
      const route = path.split("?")[0];
      if (req.method !== MessagesApi.Method || route !== MessagesApi.Path) {
        res.writeHead(404, { "content-type": MessagesApi.JsonType });
        res.end(MessagesApi.NotFound);
        return;
      }
      res.writeHead(200, { "content-type": MessagesApi.ContentType, "cache-control": MessagesApi.CacheControl });
      res.end(script.map(frame).join(""));
    });
  });
  return new Promise<ScriptedMessagesApi>((resolve, reject) => {
    server.once("error", reject);
    server.listen(MessagesApi.Port, MessagesApi.Host, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `${MessagesApi.Scheme}${MessagesApi.Host}:${port}`,
        requests,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
