import { stripNonComments } from "./strip-comments.ts";

export const ADAPTERS_PACKAGE = "@stateforge-labs/harness-adapters";

const ALLOWED_BARE_IMPORTS = new Set(["zod", "@stateforge-labs/harness-hooks"]);
const NODE_PREFIX = "node:";
const CATCH_ALLOWED = new Set([
  "src/driver/execute.ts",
  "src/driver/node-defaults.ts",
  "src/core/rows.ts",
  "src/core/fs.ts",
  "src/claude/locate.ts",
  "src/claude/sessions.ts",
  "src/codex/exec.ts",
  "src/codex/tools.ts",
  "src/codex/rollout.ts",
  "src/opencode/catalogue.ts",
  "src/opencode/launch.ts",
  "src/opencode/store.ts",
]);
const CATCH_USE = /\bcatch\b|\.catch\(/;
const CONSUMER_NAME = /\b(tab-recap|herdr|hc)\b/i;
const CONSOLE_USE = /\bconsole\./;
const STDIO_WRITE = /\bprocess\.(stdout|stderr)\b/;
const SDK_NAME = /@anthropic-ai\/|@openai\/codex|@opencode-ai\//;

function packageOf(spec: string): string {
  return spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : (spec.split("/")[0] ?? spec);
}

export function isAllowedBareImport(spec: string): boolean {
  const name = packageOf(spec);
  return name.startsWith(NODE_PREFIX) || ALLOWED_BARE_IMPORTS.has(name);
}

export function sourceViolations(rel: string, pkgRel: string, src: string, bareSpecs: readonly string[]): string[] {
  const out: string[] = [];
  for (const spec of bareSpecs) if (!isAllowedBareImport(spec)) out.push(`${rel}: third-party import not allowed in adapters: ${spec}`);
  if (CONSOLE_USE.test(src)) out.push(`${rel}: console use in library src`);
  if (STDIO_WRITE.test(src)) out.push(`${rel}: direct stdout or stderr write in library src`);
  if (CONSUMER_NAME.test(src)) out.push(`${rel}: consumer name in library src`);
  if (SDK_NAME.test(src)) out.push(`${rel}: SDK package name in library src`);
  if (CATCH_USE.test(src) && !CATCH_ALLOWED.has(pkgRel)) out.push(`${rel}: try/catch outside the allowlist`);
  for (const v of stripNonComments(src).violations) out.push(`${rel}:${v.line}: comment not allowed: ${v.text}`);
  return out;
}

export function textViolations(rel: string, text: string): string[] {
  return CONSUMER_NAME.test(text) ? [`${rel}: consumer name in adapters docs or examples`] : [];
}

export function declarationViolations(rel: string, text: string): string[] {
  return SDK_NAME.test(text) ? [`${rel}: SDK package name in built declarations`] : [];
}
