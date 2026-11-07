// Records what the server answers for every fixture, next to the fixture as <name>.expected.json.
// Usage: bun scripts/snapshot-responses.ts
// Run it on code you trust: the contract suite later asserts the server still answers exactly this,
// so a schema or refactor change cannot alter a response without a visible diff here.
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer } from "../test/e2e/harness.ts";

const dir = join(import.meta.dir, "..", "test", "fixtures");
const srv = await startServer();
let n = 0;
try {
  for (const ev of readdirSync(dir).sort()) {
    for (const f of readdirSync(join(dir, ev)).sort()) {
      if (!f.endsWith(".json") || f.endsWith(".expected.json")) continue;
      const body = await Bun.file(join(dir, ev, f)).text();
      const res = await fetch(`${srv.base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body });
      const out = { status: res.status, body: await res.json() };
      writeFileSync(join(dir, ev, f.replace(/\.json$/, ".expected.json")), JSON.stringify(out, null, 2) + "\n");
      n++;
    }
  }
} finally {
  await srv.stop();
}
console.log(`${n} responses recorded`);
