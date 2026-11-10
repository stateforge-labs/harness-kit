import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { messagesTextStream, messagesToolUseStream, scriptedMessagesApi, type ScriptedMessagesApi } from "../../../src/testing/index.ts";

const pkg = join(import.meta.dir, "..", "..", "..");
const open: ScriptedMessagesApi[] = [];

afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
});

async function serve(script: readonly unknown[]): Promise<ScriptedMessagesApi> {
  const api = await scriptedMessagesApi(script);
  open.push(api);
  return api;
}

function framesOf(body: string): { event: string; data: Record<string, unknown> }[] {
  return body
    .split("\n\n")
    .filter((chunk) => chunk !== "")
    .map((chunk) => {
      const [event, data] = chunk.split("\n");
      return { event: (event ?? "").replace("event: ", ""), data: JSON.parse((data ?? "").replace("data: ", "")) as Record<string, unknown> };
    });
}

describe("scriptedMessagesApi", () => {
  test("answers POST /v1/messages with the scripted stream as server-sent events", async () => {
    const api = await serve(messagesTextStream("hello", { input: 11, output: 12 }));
    expect(api.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(`${api.baseUrl}/v1/messages?beta=true`, { method: "POST", body: "{}", headers: { "x-api-key": "sk-stub-key-1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const frames = framesOf(await response.text());
    expect(frames.map((frame) => frame.event)).toEqual(["message_start", "content_block_start", "content_block_delta", "content_block_stop", "message_delta", "message_stop"]);
    expect(frames[2]?.data).toMatchObject({ delta: { type: "text_delta", text: "hello" } });
    expect(frames[0]?.data).toMatchObject({ message: { usage: { input_tokens: 11 } } });
    expect(frames[4]?.data).toMatchObject({ delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } });
  });

  test("a tool use stream stops for the tool result", async () => {
    const api = await serve(messagesToolUseStream("Bash", { command: "pwd" }));
    const frames = framesOf(await (await fetch(`${api.baseUrl}/v1/messages`, { method: "POST", body: "{}" })).text());
    expect(frames[1]?.data).toMatchObject({ content_block: { type: "tool_use", name: "Bash" } });
    expect(frames[2]?.data).toMatchObject({ delta: { type: "input_json_delta", partial_json: '{"command":"pwd"}' } });
    expect(frames[4]?.data).toMatchObject({ delta: { stop_reason: "tool_use" } });
  });

  test("records the path with its query and the headers, with the key headers masked", async () => {
    const api = await serve(messagesTextStream("x"));
    await fetch(`${api.baseUrl}/v1/messages?beta=true`, {
      method: "POST",
      body: "{}",
      headers: { "x-api-key": "sk-stub-key-2", authorization: "Bearer token-value", "anthropic-version": "2023-06-01" },
    });
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]?.path).toBe("/v1/messages?beta=true");
    expect(api.requests[0]?.headers["x-api-key"]).toBe("[masked]");
    expect(api.requests[0]?.headers["authorization"]).toBe("[masked]");
    expect(api.requests[0]?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.stringify(api.requests)).not.toMatch(/sk-stub-key-2|token-value/);
  });

  test("answers every request with the same stream and records each", async () => {
    const api = await serve(messagesTextStream("again"));
    for (let n = 0; n < 3; n += 1) await (await fetch(`${api.baseUrl}/v1/messages`, { method: "POST", body: "{}" })).text();
    expect(api.requests).toHaveLength(3);
  });

  test("anything else is a 404", async () => {
    const api = await serve(messagesTextStream("x"));
    expect((await fetch(`${api.baseUrl}/v1/messages`)).status).toBe(404);
    expect((await fetch(`${api.baseUrl}/elsewhere`, { method: "POST", body: "{}" })).status).toBe(404);
  });

  test("close frees the port and settles even with a connection open", async () => {
    const api = await scriptedMessagesApi(messagesTextStream("x"));
    await (await fetch(`${api.baseUrl}/v1/messages`, { method: "POST", body: "{}" })).text();
    await api.close();
    const after = await fetch(`${api.baseUrl}/v1/messages`, { method: "POST", body: "{}" }).then(
      () => "answered",
      () => "refused",
    );
    expect(after).toBe("refused");
  });

  test("different servers get different ports", async () => {
    const [one, two] = await Promise.all([serve([]), serve([])]);
    expect(one.baseUrl).not.toBe(two.baseUrl);
  });
});

const ENTRY = pathToFileURL(join(pkg, "src", "testing", "index.ts")).href;
const NODE_SCRIPT = `
const { scriptedMessagesApi, messagesTextStream } = await import(${JSON.stringify(ENTRY)});
const api = await scriptedMessagesApi(messagesTextStream("from node"));
const response = await fetch(api.baseUrl + "/v1/messages?beta=true", { method: "POST", body: "{}", headers: { "x-api-key": "sk-node-stub" } });
const body = await response.text();
await api.close();
console.log(JSON.stringify({ status: response.status, text: body.includes("from node"), requests: api.requests }));
`;

describe("scriptedMessagesApi under Node", () => {
  test("serves the same stream on Node 24 with no Bun API", async () => {
    const child = Bun.spawn(["node", "--conditions=stateforge-source", "--input-type=module", "-e", NODE_SCRIPT], { cwd: pkg, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(stderr).not.toContain("Error");
    expect(code).toBe(0);
    const seen = JSON.parse(stdout.trim()) as { status: number; text: boolean; requests: { path: string; headers: Record<string, string> }[] };
    expect(seen.status).toBe(200);
    expect(seen.text).toBe(true);
    expect(seen.requests[0]?.path).toBe("/v1/messages?beta=true");
    expect(seen.requests[0]?.headers["x-api-key"]).toBe("[masked]");
  }, 60_000);
});
