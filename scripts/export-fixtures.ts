// Turns the real captured hook payloads into scrubbed, de-duplicated test fixtures.
// Usage: bun scripts/export-fixtures.ts [captures-dir] [out-dir]   (out-dir defaults to test/fixtures/claude)
// Reads captures/*/events.jsonl, keeps one payload per distinct (event, key set, discriminating values),
// scrubs paths, ids and free text, and writes test/fixtures/claude/<Event>/<nn>-<label>.json.
// Re-running replaces the fixtures, so the output is reproducible from the captures.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const capturesDir =
  process.argv[2] ?? join(root, "docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures");
// Claude Code only: other harnesses have their own folders under test/fixtures, which this script must never clear.
const outDir = process.argv[3] ?? join(root, "test/fixtures/claude");

/** Keys whose string values are free text typed by a person or produced by a model. */
const FREE_TEXT = new Set([
  "prompt", "last_assistant_message", "compact_summary", "custom_instructions", "message", "content",
  "new_string", "old_string", "stdout", "stderr", "output", "error_details", "summary", "description",
  "result", "text", "title", "session_title", "expanded_prompt", "command_args", "args",
]);
/** Values that pick a variant of an event; two payloads that differ here are both kept. */
const DISCRIMINATORS = ["trigger", "source", "notification_type", "command_source", "error", "reason", "tool_name", "mode", "memory_type", "load_reason"];
const MAX_PER_EVENT = 8;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

function scrubString(key: string, s: string, id: string): string {
  if (FREE_TEXT.has(key)) return `PLACEHOLDER-${key}`;
  let out = s
    .replace(/CAPTURE_TOKEN=\S+/g, "CAPTURE_TOKEN=REDACTED")
    .replace(/Bearer\s+\S+/g, "Bearer REDACTED")
    .replace(/\/home\/[A-Za-z0-9_-]+/g, "/home/user")
    .replace(/\/tmp\/tmp\.[A-Za-z0-9]+/g, "/tmp/work")
    .replace(/-tmp-tmp-[A-Za-z0-9]+/g, "-tmp-work")
    .replace(/-home-[a-z0-9_]+-/g, "-home-user-")
    .replace(/\/home\/user\/\.claude\/projects\/[^/]+\/[0-9a-f-]{36}/g, `/home/user/.claude/projects/p/${id}`)
    .replace(/(claude-tmp\/claude-\d+\/[^/]+\/)[0-9a-f-]{36}/g, `$1${id}`)
    .replace(UUID, "00000000-0000-4000-8000-000000000000");
  if (out.length > 300) out = `LONG-${key}-${out.length}`;
  return out;
}

function scrub(v: unknown, key: string, id: string): unknown {
  if (typeof v === "string") return key === "session_id" ? id : scrubString(key, v, id);
  if (Array.isArray(v)) return v.map((x) => scrub(x, key, id));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x, k, id)]));
  }
  return v;
}

type Payload = Record<string, unknown>;
const groups = new Map<string, Map<string, Payload>>();
for (const name of readdirSync(capturesDir).sort()) {
  const file = join(capturesDir, name, "events.jsonl");
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const p = (JSON.parse(line) as { payload?: Payload }).payload;
    const ev = p?.hook_event_name;
    if (!p || typeof ev !== "string") continue;
    const disc = DISCRIMINATORS.filter((k) => k !== "error" || ev === "StopFailure")
      .map((k) => (typeof p[k] === "string" ? `${k}=${p[k]}` : "")).join("|");
    const key = `${Object.keys(p).sort().join(",")}#${disc}`;
    const g = groups.get(ev) ?? new Map();
    groups.set(ev, g);
    if (!g.has(key)) g.set(key, p);
  }
}

rmSync(outDir, { recursive: true, force: true });
let total = 0;
for (const [ev, g] of [...groups].sort()) {
  mkdirSync(join(outDir, ev), { recursive: true });
  let n = 0;
  for (const p of g.values()) {
    if (n >= MAX_PER_EVENT) break;
    n++;
    const id = `fx-${ev}-${n}`;
    const label = String(p.tool_name ?? p.trigger ?? p.source ?? p.notification_type ?? p.command_source ?? p.error ?? "base")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
    const fixture = scrub(p, "", id) as Payload;
    writeFileSync(join(outDir, ev, `${String(n).padStart(2, "0")}-${label}.json`), JSON.stringify(fixture, null, 2) + "\n");
    total++;
  }
}
console.log(`${total} fixtures for ${groups.size} events -> ${outDir}`);
