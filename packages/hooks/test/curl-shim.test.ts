import { describe, expect, test } from "bun:test";
import { CURL_MIN_VERSION, CurlTokenSource, curlSupports, parseCurlVersion, renderCurlShim } from "../src/index.ts";

describe("curl shim generator", () => {
  test("parseCurlVersion reads the first line of curl --version", () => {
    expect(parseCurlVersion("curl 8.23.0 (x86_64-pc-linux-gnu) libcurl/8.23.0 OpenSSL/3.6.5")).toBe("8.23.0");
    expect(parseCurlVersion("curl 7.88.1 (x86_64-pc-linux-gnu)")).toBe("7.88.1");
    expect(parseCurlVersion("wget 1.21")).toBeUndefined();
    expect(parseCurlVersion("")).toBeUndefined();
  });

  test("curlSupports compares against the minimum of the token mechanism", () => {
    expect(CURL_MIN_VERSION[CurlTokenSource.Env]).toBe("8.3.0");
    expect(curlSupports("8.3.0")).toBe(true);
    expect(curlSupports("8.2.9")).toBe(false);
    expect(curlSupports("9.0.0")).toBe(true);
    expect(curlSupports("7.88.1")).toBe(false);
    expect(curlSupports("7.88.1", CurlTokenSource.File)).toBe(true);
    expect(curlSupports("7.54.9", CurlTokenSource.File)).toBe(false);
  });

  test("the script never carries the token and takes the bearer header from the environment", () => {
    const script = renderCurlShim({ harness: "claude", url: "http://127.0.0.1:8787/" });
    expect(script).toContain("--variable '%HOOK_TOKEN' --expand-header 'authorization: Bearer {{HOOK_TOKEN}}'");
    expect(script).toContain("'http://127.0.0.1:8787/hook/claude'");
    expect(script).not.toContain("--unix-socket");
  });

  test("fail-closed bodies are rendered per event, and only for events that can be refused", () => {
    const script = renderCurlShim({ harness: "codex", failClosed: true, events: ["PreToolUse", "PermissionRequest", "Stop"] });
    expect(script).toContain("'PreToolUse')");
    expect(script).toContain("'PermissionRequest')");
    expect(script).not.toContain("'Stop')");
    expect(renderCurlShim({ harness: "codex" })).not.toContain('case "$event"');
  });

  test("a timeout is written as seconds", () => {
    expect(renderCurlShim({ harness: "claude", timeoutMs: 1500 })).toContain("--max-time '1.5'");
    expect(renderCurlShim({ harness: "claude" })).toContain("--max-time '5'");
  });

  test("unsafe values are refused rather than written into the script", () => {
    expect(() => renderCurlShim({ harness: "claude; rm" })).toThrow(TypeError);
    expect(() => renderCurlShim({ harness: "claude", failClosed: true, events: ["Pre'Tool"] })).toThrow(TypeError);
    expect(() => renderCurlShim({ harness: "claude", timeoutMs: 0 })).toThrow(TypeError);
    expect(() => renderCurlShim({ harness: "claude", tokenSource: CurlTokenSource.File })).toThrow(TypeError);
  });
});
