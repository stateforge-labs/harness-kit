// Records, for every fixture, what the server answers (<name>.expected.json: status and body) and what it logs
// (<name>.log.json: the log line without its timestamp), next to the fixture.
// Usage: bun scripts/snapshot-responses.ts
// Run it on code you trust: the contract suite later asserts the server still answers exactly this,
// so a schema or refactor change cannot alter a response without a visible diff here.
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eventually, startServer } from "../test/e2e/harness.ts";

const dir = join(import.meta.dir, "..", "test", "fixtures");
const srv = await startServer();
let n = 0;
try {
  for (const ev of readdirSync(dir).sort()) {
    for (const f of readdirSync(join(dir, ev)).sort()) {
      if (!f.endsWith(".json") || f.endsWith(".expected.json") || f.endsWith(".log.json")) continue;
      const body = await Bun.file(join(dir, ev, f)).text();
      const res = await fetch(`${srv.base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body });
      const out = { status: res.status, body: await res.json() };
      writeFileSync(join(dir, ev, f.replace(/\.json$/, ".expected.json")), JSON.stringify(out, null, 2) + "\n");

      // Fixture session ids are unique per fixture, so the id finds the one log line this post produced.
      const id = (JSON.parse(body) as { session_id: string }).session_id;
      const line = await eventually(async () => {
        const f2 = Bun.file(srv.logFile);
        const text = (await f2.exists()) ? await f2.text() : "";
        const lines = text.split("\n");
        if (!text.endsWith("\n")) lines.pop();
        return lines.find((l) => l.includes(`"session_id":"${id}"`));
      });
      const { ts: _ts, ...entry } = JSON.parse(line) as Record<string, unknown>;
      writeFileSync(join(dir, ev, f.replace(/\.json$/, ".log.json")), JSON.stringify(entry, null, 2) + "\n");
      n++;
    }
  }
} finally {
  await srv.stop();
}
console.log(`${n} responses and log lines recorded`);
