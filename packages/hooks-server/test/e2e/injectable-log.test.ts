import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvVar, processEnv } from "@stateforge-labs/harness-hooks";
import { hookEnvNames } from "./harness.ts";
import { fixture, variant } from "./kit.ts";

const LISTENING = /listening on (\S+):(\d+)/;

describe("the server keeps logging its faults through the injected sinks", () => {
  test("a middleware that throws is written to stderr by the server", async () => {
    const env: Record<string, string | undefined> = { ...processEnv() };
    for (const k of Object.keys(env)) if (k === EnvVar.Port || hookEnvNames.has(k)) delete env[k];
    const dir = await mkdtemp(join(tmpdir(), "harness-hooks-log-"));
    const proc = Bun.spawn(["bun", "src/server.ts"], {
      cwd: join(import.meta.dir, "..", ".."),
      env: {
        ...env,
        [EnvVar.Port]: "0",
        [EnvVar.HookLogFile]: join(dir, "events.jsonl"),
        [EnvVar.HookMiddleware]: join(import.meta.dir, "middleware-modules", "throws.ts"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let seen = "";
      let match = LISTENING.exec(seen);
      while (!match) {
        const { value, done } = await reader.read();
        if (done) throw new Error("server exited before listening");
        seen += decoder.decode(value);
        match = LISTENING.exec(seen);
      }
      const res = await fetch(`http://${match[1]}:${match[2]}/hook/claude`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(variant(fixture("claude", "SessionStart"))),
      });
      expect(res.status).toBe(200);
      proc.kill("SIGTERM");
      await proc.exited;
      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain("boom from a middleware");
    } finally {
      proc.kill();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
