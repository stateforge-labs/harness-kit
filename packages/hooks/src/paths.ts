// Where the package's non-code parts live on disk, so other packages and tools find them without reaching across folders.
// This file runs from two places: src/paths.ts (Bun, sources) and dist/src/paths.js (Node, the build). Built clients sit at
// dist/clients/** with a .js extension; fixtures and schemas are not built and stay at the package root.
import { fileURLToPath } from "node:url";

const built = import.meta.url.endsWith(".js");
const ext = built ? ".js" : ".ts";
const packageRoot = built ? "../../" : "../";
const at = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/** The command shim (stdin -> HTTP), run by Codex command hooks and Claude Code SessionStart/Setup. Imports nothing. */
export const shimPath = at(`../clients/shim/hook-shim${ext}`);
/** The OpenCode plugin, copied into OpenCode's `plugins/` directory. Imports nothing. */
export const opencodePluginPath = at(`../clients/opencode/plugin${ext}`);
/** Captured and synthetic payloads per harness, with `.expected.json`, `.log.json` and `provenance.json`. */
export const fixturesDir = at(`${packageRoot}fixtures`);
/** Generated JSON Schema per harness event. */
export const schemasDir = at(`${packageRoot}schemas`);
