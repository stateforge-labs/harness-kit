import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { opencodePluginPath } from "@stateforge-labs/harness-hooks";
import { join } from "node:path";
import { ClaudeHook, WORKTREE_TIMEOUT_MS, adapters } from "@stateforge-labs/harness-hooks";
import { CURL_MIN_VERSION, CurlTokenSource, EnvVar, processEnv } from "@stateforge-labs/harness-hooks";
import { pathWith } from "./fake-curl.ts";

const repo = join(import.meta.dir, "..", "..");
const CURL_NEW = { version: "8.5.0" };
const CURL_MID = { version: "7.88.1", rejectTokenFlags: true };
const CURL_OLD = { version: "7.50.0" };
const TOKEN = `tok-${crypto.randomUUID()}`;
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "harness-hooks-install-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function install(args: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn([process.execPath, join(repo, "scripts/install.ts"), ...args], { cwd: repo, stdout: "pipe", stderr: "pipe", env: { ...processEnv(), [EnvVar.Home]: dir, [EnvVar.XdgConfigHome]: join(dir, "xdg"), ...newCurl, ...env } });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}
let newCurl: Record<string, string>;
let midCurl: Record<string, string>;
let oldCurl: Record<string, string>;
beforeAll(async () => {
  newCurl = await pathWith(dir, CURL_NEW);
  midCurl = await pathWith(dir, CURL_MID);
  oldCurl = await pathWith(dir, CURL_OLD);
});
const eventsOf = (harness: string) => Object.keys(adapters.get(harness)!.jsonSchemas()).sort();

describe("e2e: scripts/install.ts", () => {
  test("claude: a hook for every event, http except SessionStart and Setup, pointing at the given URL", async () => {
    const r = await install(["claude", "--shim", "ts", "--url", "http://127.0.0.1:9999/"]);
    expect(r.code).toBe(0);
    const { hooks } = JSON.parse(r.stdout) as { hooks: Record<string, { hooks: { type: string; url?: string; command?: string }[] }[]> };
    expect(Object.keys(hooks).sort()).toEqual(eventsOf("claude"));
    for (const [event, groups] of Object.entries(hooks)) {
      const h = groups[0]!.hooks[0]!;
      if (event === "SessionStart" || event === "Setup") {
        expect(h.type).toBe("command");
        expect(h.command).toContain("--harness claude");
        expect(h.command).toContain(`${EnvVar.HookUrl}=http://127.0.0.1:9999 `);
      } else {
        expect(h).toMatchObject({ type: "http", url: "http://127.0.0.1:9999/hook" });
      }
      const worktreeHook = event === ClaudeHook.WorktreeCreate || event === ClaudeHook.WorktreeRemove;
      expect((h as { timeout?: number }).timeout).toBe(worktreeHook ? WORKTREE_TIMEOUT_MS / 1000 : 10);
    }
  });

  test("claude with --socket: every event uses the shim command with its event name and no hook is http", async () => {
    const shimDir = join(dir, "socket-shims");
    const r = await install(["claude", "--shim", "curl", "--shim-dir", shimDir, "--socket", join(dir, "h.sock")]);
    expect(r.code).toBe(0);
    const { hooks } = JSON.parse(r.stdout) as { hooks: Record<string, { hooks: { type: string; command?: string }[] }[]> };
    expect(Object.keys(hooks).sort()).toEqual(eventsOf("claude"));
    for (const [event, groups] of Object.entries(hooks)) {
      const h = groups[0]!.hooks[0]!;
      expect(h.type).toBe("command");
      expect(h.command).toBe(`'${join(shimDir, "harness-hooks-claude.sh")}' ${event}`);
    }
  });

  test("a --shim-dir containing a space gives a quoted shim path that a shell runs as one word", async () => {
    const shimDir = join(dir, "shim dir with space");
    const r = await install(["claude", "--shim", "curl", "--shim-dir", shimDir]);
    const command = JSON.parse(r.stdout).hooks.SessionStart[0].hooks[0].command as string;
    expect(command).toBe(`'${join(shimDir, "harness-hooks-claude.sh")}' SessionStart`);
    const words = Bun.spawnSync(["sh", "-c", `printf '%s\\n' ${command}`]).stdout.toString().trim().split("\n");
    expect(words).toEqual([join(shimDir, "harness-hooks-claude.sh"), "SessionStart"]);
  });

  test("claude: --apply is refused, because the settings are managed elsewhere", async () => {
    const r = await install(["claude", "--shim", "ts", "--apply"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("dotfiles");
  });

  test("codex: a shim command for every event; --apply writes hooks.json once and refuses to overwrite a different file", async () => {
    const home = join(dir, "codex-home");
    const preview = await install(["codex", "--shim", "ts", "--codex-home", home]);
    expect(Object.keys(JSON.parse(preview.stdout).hooks).sort()).toEqual(eventsOf("codex"));
    expect(await Bun.file(join(home, "hooks.json")).exists()).toBe(false);

    expect((await install(["codex", "--shim", "ts", "--apply", "--codex-home", home])).code).toBe(0);
    const written = await readFile(join(home, "hooks.json"), "utf8");
    expect(JSON.parse(written).hooks.Stop[0].hooks[0].command).toContain("--harness codex");
    expect((await install(["codex", "--shim", "ts", "--apply", "--codex-home", home])).stdout).toContain("unchanged");

    await writeFile(join(home, "hooks.json"), '{"hooks":{}}');
    const clash = await install(["codex", "--shim", "ts", "--apply", "--codex-home", home]);
    expect(clash.code).toBe(1);
    expect(await readFile(join(home, "hooks.json"), "utf8")).toBe('{"hooks":{}}');
  });

  test("claude with the curl shim: --apply writes only the script into --shim-dir and the block points at it", async () => {
    const shimDir = join(dir, "claude-shims");
    const preview = await install(["claude", "--shim", "curl", "--shim-dir", shimDir]);
    expect(preview.code).toBe(0);
    expect(await Bun.file(join(shimDir, "harness-hooks-claude.sh")).exists()).toBe(false);
    const hooks = JSON.parse(preview.stdout).hooks as Record<string, { hooks: { type: string; command?: string }[] }[]>;
    expect(hooks.SessionStart![0]!.hooks[0]!.command).toBe(`'${join(shimDir, "harness-hooks-claude.sh")}' SessionStart`);

    const applied = await install(["claude", "--shim", "curl", "--shim-dir", shimDir, "--socket", join(dir, "h.sock"), "--apply"]);
    expect(applied.code).toBe(0);
    const script = join(shimDir, "harness-hooks-claude.sh");
    expect((await stat(script)).mode & 0o777).toBe(0o755);
    const text = await readFile(script, "utf8");
    expect(text.startsWith("#!/bin/sh\n")).toBe(true);
    expect(text).toContain(`--unix-socket '${join(dir, "h.sock")}'`);
    expect(text).toContain("/hook/claude");
    expect((await install(["claude", "--shim", "curl", "--shim-dir", shimDir, "--socket", join(dir, "h.sock"), "--apply"])).stdout).toContain("unchanged");
  });

  test("codex with the curl shim: every hook runs the script with its event name, and hooks.json is written next to a script in --shim-dir", async () => {
    const home = join(dir, "codex-curl-home");
    const shimDir = join(dir, "codex-shims");
    const r = await install(["codex", "--shim", "curl", "--shim-dir", shimDir, "--codex-home", home, "--apply"]);
    expect(r.code).toBe(0);
    const { hooks } = JSON.parse(await readFile(join(home, "hooks.json"), "utf8")) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
    expect(Object.keys(hooks).sort()).toEqual(eventsOf("codex"));
    for (const [event, groups] of Object.entries(hooks)) expect(groups[0]!.hooks[0]!.command).toBe(`'${join(shimDir, "harness-hooks-codex.sh")}' ${event}`);
    expect(await Bun.file(join(shimDir, "harness-hooks-codex.sh")).exists()).toBe(true);
  });

  test("auto picks the curl shim when curl of the minimum version is on PATH, and the TypeScript shim when it is not", async () => {
    const withCurl = await install(["codex"]);
    expect(withCurl.stdout).toContain("harness-hooks-codex.sh");
    const noCurl = await install(["codex"], { [EnvVar.Path]: join(dir, "empty-path") });
    expect(noCurl.stdout).toContain("--harness codex");
    expect(noCurl.stdout).not.toContain("harness-hooks-codex.sh");
    const refused = await install(["codex", "--shim", "curl"], { [EnvVar.Path]: join(dir, "empty-path") });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(CURL_MIN_VERSION[CurlTokenSource.File]);
  });

  test("curl 8.5: the environment mechanism, no header file is written even with a token", async () => {
    const shimDir = join(dir, "env-mech");
    const r = await install(["claude", "--shim", "curl", "--shim-dir", shimDir, "--apply"], { ...newCurl, [EnvVar.HookToken]: TOKEN });
    expect(r.code).toBe(0);
    const text = await readFile(join(shimDir, "harness-hooks-claude.sh"), "utf8");
    expect(text).toContain("--expand-header");
    expect(text).not.toContain(TOKEN);
    expect(await Bun.file(join(shimDir, "harness-hooks-claude.header")).exists()).toBe(false);
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
  });

  test("curl 7.88 with a token: the header file is written user-only next to the script, and the script has no token mechanism flag that 7.88 lacks", async () => {
    const shimDir = join(dir, "file-mech");
    const r = await install(["claude", "--shim", "curl", "--shim-dir", shimDir, "--apply"], { ...midCurl, [EnvVar.HookToken]: TOKEN });
    expect(r.code).toBe(0);
    const headerPath = join(shimDir, "harness-hooks-claude.header");
    expect((await stat(headerPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(headerPath, "utf8")).toBe(`authorization: Bearer ${TOKEN}\n`);
    const text = await readFile(join(shimDir, "harness-hooks-claude.sh"), "utf8");
    expect(text).toContain(`'@${headerPath}'`);
    expect(text).not.toContain("--variable");
    expect(text).not.toContain("--expand-header");
    expect(text).not.toContain(TOKEN);
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
    const again = await install(["claude", "--shim", "curl", "--shim-dir", shimDir, "--apply"], { ...midCurl, [EnvVar.HookToken]: TOKEN });
    expect(again.stdout).toContain("unchanged");
  });

  test("curl 7.88 without a token, on a socket: no token mechanism at all and no header file", async () => {
    const shimDir = join(dir, "none-mech");
    const r = await install(["claude", "--shim", "curl", "--shim-dir", shimDir, "--socket", join(dir, "h.sock"), "--apply"], { ...midCurl, [EnvVar.HookToken]: "" });
    expect(r.code).toBe(0);
    const text = await readFile(join(shimDir, "harness-hooks-claude.sh"), "utf8");
    expect(text).toContain(`--unix-socket '${join(dir, "h.sock")}'`);
    for (const flag of ["--variable", "--expand-header", "--header"]) expect(text).not.toContain(flag);
    expect(await Bun.file(join(shimDir, "harness-hooks-claude.header")).exists()).toBe(false);
  });

  test("curl 7.88: auto picks the curl shim", async () => {
    expect((await install(["codex"], midCurl)).stdout).toContain("harness-hooks-codex.sh");
  });

  test("curl 7.50: --shim curl and --socket refuse and name the minimum; auto picks the TypeScript shim", async () => {
    const forced = await install(["codex", "--shim", "curl"], oldCurl);
    expect(forced.code).toBe(1);
    expect(forced.stderr).toContain(CURL_MIN_VERSION[CurlTokenSource.File]);
    expect(forced.stderr).toContain("7.50.0");
    const socket = await install(["codex", "--socket", join(dir, "h.sock")], oldCurl);
    expect(socket.code).toBe(1);
    expect(socket.stderr).toContain(CURL_MIN_VERSION[CurlTokenSource.File]);
    const auto = await install(["codex"], oldCurl);
    expect(auto.code).toBe(0);
    expect(auto.stdout).toContain("--harness codex");
    expect(auto.stdout).not.toContain("harness-hooks-codex.sh");
  });

  test("no curl on PATH: --shim curl names none as found", async () => {
    const r = await install(["codex", "--shim", "curl"], { [EnvVar.Path]: join(dir, "empty-path") });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("found none");
  });

  test("--shim must be auto, curl or ts", async () => {
    expect((await install(["codex", "--shim", "wget"])).code).toBe(1);
  });

  test("service: --socket puts the socket path in the unit", async () => {
    const r = await install(["service", "--socket", "/run/user/1000/harness-hooks.sock"]);
    expect(r.stdout).toContain(`Environment=${EnvVar.HookSocket}=/run/user/1000/harness-hooks.sock`);
  });

  test("opencode: --apply copies the plugin, a second run is a no-op copy, and without --apply nothing is written", async () => {
    const cfg = join(dir, "opencode-cfg");
    const dry = await install(["opencode", "--config-dir", cfg]);
    expect(dry.stdout).toContain("would copy");
    expect(await Bun.file(join(cfg, "plugins/harness-hooks.js")).exists()).toBe(false);
    expect((await install(["opencode", "--apply", "--config-dir", cfg])).code).toBe(0);
    const here = process.cwd();
    process.chdir(repo);
    const built = await Bun.build({ entrypoints: [opencodePluginPath], target: "bun", format: "esm" }).finally(() => process.chdir(here));
    const bundled = await built.outputs[0]!.text();
    const installed = await readFile(join(cfg, "plugins/harness-hooks.js"), "utf8");
    expect(installed).toBe(bundled);
    expect(installed).not.toMatch(/from "\.\.?\//);
    expect((await install(["opencode", "--apply", "--config-dir", cfg])).code).toBe(0);
  });

  test("opencode: --apply removes an older harness-hooks.ts copy so the plugin is not loaded twice", async () => {
    const cfg = join(dir, "opencode-legacy");
    await Bun.write(join(cfg, "plugins/harness-hooks.ts"), "export default {};\n");
    const r = await install(["opencode", "--apply", "--config-dir", cfg]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("removed:");
    expect(await Bun.file(join(cfg, "plugins/harness-hooks.ts")).exists()).toBe(false);
    expect(await Bun.file(join(cfg, "plugins/harness-hooks.js")).exists()).toBe(true);
  });

  test("service: the unit runs the server on loopback with the log under the state directory; --no-systemctl writes only the file", async () => {
    const unitDir = join(dir, "units");
    const preview = await install(["service", "--url", "http://127.0.0.1:9100"]);
    expect(preview.stdout).toContain(`Environment=${EnvVar.Port}=9100`);
    expect(preview.stdout).toContain(`Environment=${EnvVar.HookHost}=127.0.0.1`);
    expect(preview.stdout).toContain(`ExecStart=${process.execPath} ${repo}/src/server.ts`);
    const r = await install(["service", "--apply", "--no-systemctl", "--unit-dir", unitDir]);
    expect(r.code).toBe(0);
    expect(await readFile(join(unitDir, "harness-hooks.service"), "utf8")).toContain("WantedBy=default.target");
  });

  test("an unknown target or a bad URL is an error", async () => {
    expect((await install(["nope"])).code).toBe(1);
    expect((await install(["claude", "--url", "not a url"])).code).toBe(1);
  });
});
