import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EnvDefault, Harness, installEnv, opencodePluginPath } from "@stateforge-labs/harness-hooks";
import { claudeHooks, codexHooks, systemdUnit, type RenderOptions } from "./lib/client-config.ts";

const repo = resolve(import.meta.dir, "..");
const argv = process.argv.slice(2);
const target = argv[0];
const flag = (name: string) => argv.includes(name);
const value = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const fail = (msg: string): never => {
  console.error(`install: ${msg}`);
  process.exit(1);
};

const url = (value("--url") ?? EnvDefault.HookUrl).replace(/\/+$/, "");
try {
  new URL(url);
} catch {
  fail(`--url is not a URL: ${url}`);
}
const opts: RenderOptions = { url, repo, bun: process.execPath };
const apply = flag("--apply");
const env = installEnv();
const SERVICE = "service";
const OPENCODE_CONFIG_DIR = "opencode";
const PLUGIN_FILE = "harness-hooks.js";
const LEGACY_PLUGIN_FILE = "harness-hooks.ts";

async function bundlePlugin(): Promise<string> {
  const built = await Bun.build({ entrypoints: [opencodePluginPath], target: "bun", format: "esm" });
  if (!built.success || !built.outputs[0]) fail(`cannot bundle ${opencodePluginPath}: ${built.logs.join("; ")}`);
  return built.outputs[0]!.text();
}

function writeNew(path: string, content: string): void {
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") === content) return void console.log(`unchanged: ${path}`);
    fail(`${path} already exists with different content; merge it by hand (this script does not overwrite it)`);
  }
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote: ${path}`);
}

switch (target) {
  case Harness.OpenCode: {
    const dir = value("--config-dir") ?? join(env.configHome, OPENCODE_CONFIG_DIR);
    const from = opencodePluginPath;
    const to = join(dir, "plugins", PLUGIN_FILE);
    if (url !== EnvDefault.HookUrl) console.error("note: the plugin reads HOOK_URL from OpenCode's environment; --url is not baked into it");
    if (!apply) {
      console.log(`would copy ${from}\n         to ${to}\n(re-run with --apply; restart OpenCode's background service so it loads the plugin)`);
      break;
    }
    const bundle = await bundlePlugin();
    if (existsSync(to) && readFileSync(to, "utf8") !== bundle) console.log(`updating ${to} (it differs from the repository copy)`);
    mkdirSync(join(dir, "plugins"), { recursive: true });
    writeFileSync(to, bundle);
    const legacy = join(dir, "plugins", LEGACY_PLUGIN_FILE);
    if (existsSync(legacy)) {
      rmSync(legacy);
      console.log(`removed: ${legacy} (replaced by ${PLUGIN_FILE})`);
    }
    console.log(`installed: ${to}`);
    break;
  }
  case Harness.Claude: {
    if (apply) fail("claude settings are managed in dotfiles; merge the printed block into settings.json there (no --apply)");
    console.log(JSON.stringify(claudeHooks(opts), null, 2));
    break;
  }
  case Harness.Codex: {
    const home = value("--codex-home") ?? env.codexHome;
    const content = JSON.stringify(codexHooks(opts), null, 2) + "\n";
    if (!apply) {
      console.log(content.trimEnd());
      console.error(`(would be written to ${join(home, "hooks.json")} with --apply)`);
      break;
    }
    writeNew(join(home, "hooks.json"), content);
    break;
  }
  case SERVICE: {
    const unitDir = value("--unit-dir") ?? join(env.configHome, "systemd", "user");
    const stateDir = join(env.stateHome, "harness-hooks");
    const unit = systemdUnit(opts, stateDir);
    if (!apply) {
      console.log(unit.trimEnd());
      console.error(`(would be written to ${join(unitDir, "harness-hooks.service")}, then enabled with systemctl --user)`);
      break;
    }
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    writeNew(join(unitDir, "harness-hooks.service"), unit);
    if (!flag("--no-systemctl")) {
      for (const args of [["daemon-reload"], ["enable", "--now", "harness-hooks.service"]]) {
        const r = Bun.spawnSync(["systemctl", "--user", ...args], { stdout: "inherit", stderr: "inherit" });
        if (r.exitCode !== 0) fail(`systemctl --user ${args.join(" ")} failed (exit ${r.exitCode})`);
      }
      console.log("service enabled and started");
    }
    break;
  }
  default:
    fail("usage: install.ts <opencode|claude|codex|service> [--apply] [--url <base>] [--config-dir|--codex-home|--unit-dir <dir>] [--no-systemctl]");
}
