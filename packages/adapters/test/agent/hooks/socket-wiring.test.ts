import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EnvVar, Pipeline, adapters } from "@stateforge-labs/harness-hooks";
import { socketWiring } from "../../../src/agent/hooks/index.ts";
import type { AgentDirs, HookTarget } from "../../../src/agent/index.ts";
import { stockPipeline } from "./support.ts";

const SHIM_DIR = "/nonexistent-harness-kit-test/shims";
const SOCKET = "/nonexistent-harness-kit-test/hooks.sock";
const DIRS: AgentDirs = { cwd: "/w", home: "/w/h", configDir: "/w/c", tmpDir: "/w/t" };
const target = (pipeline: Pipeline = stockPipeline()): HookTarget => ({ pipeline, socket: { path: SOCKET, shimDir: SHIM_DIR } });

describe("socketWiring for Codex", () => {
  const result = socketWiring("codex", target(), DIRS);
  if (!result.ok) throw new Error("expected a wiring");
  const { files, env } = result.value;

  test("it renders the shim and the hooks file under the shim directory and writes nothing", () => {
    expect(files.map((f) => f.path)).toEqual([join(SHIM_DIR, "harness-hooks-codex.sh"), join(SHIM_DIR, "hooks.json")]);
    expect(existsSync(SHIM_DIR)).toBe(false);
  });

  test("the shim posts to the socket for the harness", () => {
    const shim = files[0]!.text;
    expect(shim.startsWith("#!/bin/sh")).toBe(true);
    expect(shim).toContain(`--unix-socket '${SOCKET}'`);
    expect(shim).toContain("/hook/codex");
  });

  test("the hooks file has one command handler for every event the Codex decoder knows", () => {
    const parsed = JSON.parse(files[1]!.text) as { hooks: Record<string, { hooks: { type: string; command: string }[] }[]> };
    const known = Object.keys(adapters.get("codex")!.jsonSchemas()).sort();
    expect(Object.keys(parsed.hooks).sort()).toEqual(known);
    for (const event of known) {
      expect(parsed.hooks[event]).toEqual([{ hooks: [{ type: "command", command: `'${join(SHIM_DIR, "harness-hooks-codex.sh")}' ${event}` }] }]);
    }
  });

  test("the environment names the Codex home and carries no secret", () => {
    expect(env).toEqual({ [EnvVar.CodexHome]: DIRS.configDir });
  });

  test("the shim fails open when no layer of the pipeline fails closed", () => {
    expect(files[0]!.text).not.toContain("refused (fail-closed)");
    expect(files[0]!.text).not.toContain("closed");
  });

  test("the shim fails closed, with the layer's text, when a layer of the pipeline does", () => {
    const pipeline = new Pipeline().use(() => ({}), { onFault: { deny: { reason: "guard down" } } });
    const closed = socketWiring("codex", target(pipeline), DIRS);
    if (!closed.ok) throw new Error("expected a wiring");
    expect(closed.value.files[0]!.text).toContain("guard down");
  });

  test("the same input renders the same files", () => {
    expect(socketWiring("codex", target(), DIRS)).toEqual(result);
  });
});

describe("socketWiring refusals", () => {
  test("a target without a socket fails by value", () => {
    const result = socketWiring("codex", { pipeline: stockPipeline(), socket: null }, DIRS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toMatchObject({ kind: "invalid-config", field: "hooks.socket" });
  });

  test("a relative shim directory fails by value", () => {
    const result = socketWiring("codex", { pipeline: stockPipeline(), socket: { path: SOCKET, shimDir: "shims" } }, DIRS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toMatchObject({ kind: "invalid-config", field: "hooks.socket.shimDir" });
  });

  test("a relative socket path fails by value", () => {
    const result = socketWiring("codex", { pipeline: stockPipeline(), socket: { path: "hooks.sock", shimDir: SHIM_DIR } }, DIRS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toMatchObject({ kind: "invalid-config", field: "hooks.socket.path" });
  });

  test("OpenCode is unsupported on the sdk engine, since its hooks are a plugin over HTTP", () => {
    const result = socketWiring("opencode", target(), DIRS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toMatchObject({ kind: "unsupported", capability: "hooks", engine: "sdk" });
  });
});
