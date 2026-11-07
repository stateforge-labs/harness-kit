// Measures what each hook payload really looks like, from the captured events.
// Usage: bun scripts/infer-fields.ts [captures-dir] > observed-fields.json
// Reads every captures/*/events.jsonl, groups payloads by hook_event_name and reports, for each key:
// the JSON types seen, in how many payloads it appeared, and (for objects) the same one level down.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures";

type Stat = { types: Set<string>; seen: number; children?: Map<string, Stat>; example?: unknown };

const kind = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function add(stats: Map<string, Stat>, obj: Record<string, unknown>, depth: number) {
  for (const [k, v] of Object.entries(obj)) {
    const s = stats.get(k) ?? { types: new Set(), seen: 0 };
    stats.set(k, s);
    s.seen++;
    s.types.add(kind(v));
    if (depth < 3 && v && typeof v === "object" && !Array.isArray(v)) {
      s.children ??= new Map();
      add(s.children, v as Record<string, unknown>, depth + 1);
    }
    if (Array.isArray(v) && v[0] && typeof v[0] === "object" && depth < 3) {
      s.children ??= new Map();
      for (const el of v) if (el && typeof el === "object") add(s.children, el as Record<string, unknown>, depth + 1);
    }
  }
}

const events = new Map<string, { total: number; keys: Map<string, Stat>; sources: Set<string> }>();
for (const name of readdirSync(dir)) {
  const file = join(dir, name, "events.jsonl");
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const p = (JSON.parse(line) as { payload?: Record<string, unknown> }).payload;
    const ev = p?.hook_event_name;
    if (!p || typeof ev !== "string") continue;
    const e = events.get(ev) ?? { total: 0, keys: new Map(), sources: new Set() };
    events.set(ev, e);
    e.total++;
    e.sources.add(name);
    add(e.keys, p, 0);
  }
}

const dump = (m: Map<string, Stat>): unknown =>
  Object.fromEntries([...m].sort().map(([k, s]) => [k, { types: [...s.types].sort(), seen: s.seen, ...(s.children ? { children: dump(s.children) } : {}) }]));

const out = Object.fromEntries([...events].sort().map(([ev, e]) => [ev, { payloads: e.total, captures: e.sources.size, keys: dump(e.keys) }]));
console.log(JSON.stringify(out, null, 2));
