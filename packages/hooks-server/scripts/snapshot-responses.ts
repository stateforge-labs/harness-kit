import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eventually, startServer } from "../test/e2e/harness.ts";

const root = join(import.meta.dir, "..", "..", "hooks", "fixtures");
const harnesses = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const srv = await startServer();
let n = 0;
try {
  for (const harness of harnesses) {
    const dir = join(root, harness);
    for (const ev of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
      for (const f of readdirSync(join(dir, ev)).sort()) {
        if (!f.endsWith(".json") || f.endsWith(".expected.json") || f.endsWith(".log.json")) continue;
        const body = await Bun.file(join(dir, ev, f)).text();
        const res = await fetch(`${srv.base}/hook/${harness}`, { method: "POST", headers: { "content-type": "application/json" }, body });
        const out = { status: res.status, body: await res.json() };
        writeFileSync(join(dir, ev, f.replace(/\.json$/, ".expected.json")), JSON.stringify(out, null, 2) + "\n");

        const id = (JSON.parse(body) as { session_id: string }).session_id;
        const line = await eventually(async () => {
          const f2 = Bun.file(srv.logFile);
          const text = (await f2.exists()) ? await f2.text() : "";
          const lines = text.split("\n");
          if (!text.endsWith("\n")) lines.pop();
          return lines.find((l) => l.includes(`"harness":"${harness}"`) && l.includes(`"session_id":"${id}"`));
        });
        const { ts: _ts, ...entry } = JSON.parse(line) as Record<string, unknown>;
        writeFileSync(join(dir, ev, f.replace(/\.json$/, ".log.json")), JSON.stringify(entry, null, 2) + "\n");
        n++;
      }
    }
  }
} finally {
  await srv.stop();
}
console.log(`${n} responses and log lines recorded`);
