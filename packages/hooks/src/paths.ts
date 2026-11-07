// Where the package's non-code parts live on disk, so other packages and tools find them without reaching across folders.
import { fileURLToPath } from "node:url";

const at = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/** The command shim (stdin -> HTTP), run by Codex command hooks and Claude Code SessionStart/Setup. Imports nothing. */
export const shimPath = at("../clients/shim/hook-shim.ts");
/** The OpenCode plugin, copied into OpenCode's `plugins/` directory. Imports nothing. */
export const opencodePluginPath = at("../clients/opencode/plugin.ts");
/** Captured and synthetic payloads per harness, with `.expected.json`, `.log.json` and `provenance.json`. */
export const fixturesDir = at("../fixtures");
/** Generated JSON Schema per harness event. */
export const schemasDir = at("../schemas");
