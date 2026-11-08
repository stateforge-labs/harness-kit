import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { opencodePluginPath } from "@stateforge-labs/harness-hooks";
import { join } from "node:path";
import { ClaudeHook, WORKTREE_TIMEOUT_MS, adapters } from "@stateforge-labs/harness-hooks";
import { EnvVar, processEnv } from "@stateforge-labs/harness-hooks";

const repo = join(import.meta.dir, "..", "..");
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "harness-hooks-install-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function install(args: string[]) {
  const proc = Bun.spawn(["bun", join(repo, "scripts/install.ts"), ...args], { cwd: repo, stdout: "pipe", stderr: "pipe", env: { ...processEnv(), [EnvVar.Home]: dir, [EnvVar.XdgConfigHome]: join(dir, "xdg") } });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}
const eventsOf = (harness: string) => Object.keys(adapters.get(harness)!.jsonSchemas()).sort();

describe("e2e: scripts/install.ts", () => {
  test("claude: a hook for every event, http except SessionStart and Setup, pointing at the given URL", async () => {
    const r = await install(["claude", "--url", "http://127.0.0.1:9999/"]);
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

  test("claude: --apply is refused, because the settings are managed elsewhere", async () => {
    const r = await install(["claude", "--apply"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("dotfiles");
  });

  test("codex: a shim command for every event; --apply writes hooks.json once and refuses to overwrite a different file", async () => {
    const home = join(dir, "codex-home");
    const preview = await install(["codex", "--codex-home", home]);
    expect(Object.keys(JSON.parse(preview.stdout).hooks).sort()).toEqual(eventsOf("codex"));
    expect(await Bun.file(join(home, "hooks.json")).exists()).toBe(false);

    expect((await install(["codex", "--apply", "--codex-home", home])).code).toBe(0);
    const written = await readFile(join(home, "hooks.json"), "utf8");
    expect(JSON.parse(written).hooks.Stop[0].hooks[0].command).toContain("--harness codex");
    expect((await install(["codex", "--apply", "--codex-home", home])).stdout).toContain("unchanged");

    await writeFile(join(home, "hooks.json"), '{"hooks":{}}');
    const clash = await install(["codex", "--apply", "--codex-home", home]);
    expect(clash.code).toBe(1);
    expect(await readFile(join(home, "hooks.json"), "utf8")).toBe('{"hooks":{}}');
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
