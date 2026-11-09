import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CURL_MIN_VERSION, CurlTokenSource, EnvDefault, Harness, curlSupports, installEnv, opencodePluginPath, parseCurlVersion, renderCurlShim, shimEnv } from "@stateforge-labs/harness-hooks";
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
const apply = flag("--apply");
const env = installEnv();
const ShimKind = { Auto: "auto", Curl: "curl", Ts: "ts" } as const;
const SHIM_DIR_NAME = "bin";
const SHIM_FILE_MODE = 0o755;
const STATE_DIR_NAME = "harness-hooks";

function curlVersion(): string | undefined {
  try {
    const r = Bun.spawnSync(["curl", "--version"], { stdout: "pipe", stderr: "ignore" });
    return r.exitCode === 0 ? parseCurlVersion(r.stdout.toString()) : undefined;
  } catch {
    return undefined;
  }
}

function chooseShim(): "curl" | "ts" {
  const wanted = value("--shim") ?? ShimKind.Auto;
  if (wanted !== ShimKind.Auto && wanted !== ShimKind.Curl && wanted !== ShimKind.Ts) return fail(`--shim must be ${Object.values(ShimKind).join(", ")}: ${wanted}`);
  if (wanted === ShimKind.Ts) return ShimKind.Ts;
  const version = curlVersion();
  const usable = version !== undefined && curlSupports(version, CurlTokenSource.Env);
  if (usable) return ShimKind.Curl;
  if (wanted === ShimKind.Curl) return fail(`--shim curl needs curl ${CURL_MIN_VERSION[CurlTokenSource.Env]} or later on PATH (found ${version ?? "none"})`);
  return ShimKind.Ts;
}

const shimKind = chooseShim();
const socketPath = value("--socket");
const shimDir = value("--shim-dir") ?? join(env.stateHome, STATE_DIR_NAME, SHIM_DIR_NAME);
const shimFile = (harness: string): string => join(shimDir, `harness-hooks-${harness}.sh`);
const opts: RenderOptions = { url, repo, bun: process.execPath, ...(socketPath ? { socketPath } : {}), ...(shimKind === ShimKind.Curl ? { curlShimFile: shimFile } : {}) };

function writeShim(harness: string): void {
  const client = shimEnv();
  const script = renderCurlShim({
    harness,
    url,
    ...(socketPath ? { socketPath } : {}),
    timeoutMs: client.timeoutMs,
    failClosed: client.failClosed,
    denyReason: client.denyReason,
  });
  const path = shimFile(harness);
  if (existsSync(path) && readFileSync(path, "utf8") === script) return void console.log(`unchanged: ${path}`);
  mkdirSync(shimDir, { recursive: true });
  writeFileSync(path, script, { mode: SHIM_FILE_MODE });
  chmodSync(path, SHIM_FILE_MODE);
  console.log(`wrote: ${path}`);
}
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
    if (apply && shimKind === ShimKind.Ts) fail("claude settings are managed in dotfiles; merge the printed block into settings.json there (no --apply)");
    if (apply) writeShim(Harness.Claude);
    console.log(JSON.stringify(claudeHooks(opts), null, 2));
    break;
  }
  case Harness.Codex: {
    const home = value("--codex-home") ?? env.codexHome;
    const content = JSON.stringify(codexHooks(opts), null, 2) + "\n";
    if (apply && shimKind === ShimKind.Curl) writeShim(Harness.Codex);
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
    const stateDir = join(env.stateHome, STATE_DIR_NAME);
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
    fail("usage: install.ts <opencode|claude|codex|service> [--apply] [--url <base>] [--shim auto|curl|ts] [--shim-dir <dir>] [--socket <path>] [--config-dir|--codex-home|--unit-dir <dir>] [--no-systemctl]");
}
