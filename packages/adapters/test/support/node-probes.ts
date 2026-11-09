export const TRAPPED_MODULES = ["fs", "fs/promises", "child_process", "net", "dns", "os"] as const;

export function importProbeScript(urls: readonly string[]): string {
  return `
import { createRequire, syncBuiltinESMExports } from "node:module";
const require = createRequire(process.cwd() + "/");
const TARGETS = ${JSON.stringify(TRAPPED_MODULES)};
const URLS = ${JSON.stringify(urls)};
const DIST_MARK = "/dist/src/";
const io = [];
const envReads = [];
const cwdCalls = [];
const fromPackage = () => {
  const saved = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  try {
    return new Error().stack.includes(DIST_MARK);
  } finally {
    Error.stackTraceLimit = saved;
  }
};
for (const name of TARGETS) {
  const mod = require(name);
  for (const key of Object.keys(mod)) {
    const fn = mod[key];
    if (typeof fn !== "function") continue;
    try {
      mod[key] = function trapped(...args) {
        if (fromPackage()) io.push(name + "." + key);
        return fn.apply(this, args);
      };
    } catch {}
  }
}
syncBuiltinESMExports();
const realEnv = process.env;
process.env = new Proxy(realEnv, {
  get(target, key, receiver) {
    if (fromPackage()) envReads.push(String(key));
    return Reflect.get(target, key, receiver);
  },
  has(target, key) {
    if (fromPackage()) envReads.push(String(key));
    return Reflect.has(target, key);
  },
  ownKeys(target) {
    if (fromPackage()) envReads.push("*");
    return Reflect.ownKeys(target);
  },
  getOwnPropertyDescriptor(target, key) {
    if (fromPackage()) envReads.push(String(key));
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
});
const realCwd = process.cwd;
process.cwd = function trackedCwd() {
  if (fromPackage()) cwdCalls.push("cwd");
  return realCwd.call(process);
};
const report = {};
for (const url of URLS) {
  io.length = 0;
  envReads.length = 0;
  cwdCalls.length = 0;
  await import(url);
  report[url] = { io: [...io], env: [...envReads], cwd: cwdCalls.length };
}
console.log(JSON.stringify(report));
`;
}

export function bunImportScript(urls: readonly string[]): string {
  return `
const URLS = ${JSON.stringify(urls)};
const loaded = [];
for (const url of URLS) {
  await import(url);
  loaded.push(url);
}
console.log(JSON.stringify(loaded));
`;
}

export function processGroupScript(nodeDefaultsUrl: string): string {
  return `
import { tmpdir } from "node:os";
const { nodeRunner } = await import(${JSON.stringify(nodeDefaultsUrl)});
const PATH = process.env.PATH ?? "";
const SYSTEM_NO_PROCESS = "ESRCH";

function spec(program, args) {
  return { program, args, env: { PATH }, cwd: tmpdir(), stdin: null };
}

function gone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === SYSTEM_NO_PROCESS;
  }
}

async function goneWithin(pid, ms) {
  const deadline = Date.now() + ms;
  while (!gone(pid)) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return true;
}

async function drain(stream) {
  let text = "";
  for await (const chunk of stream) text += Buffer.from(chunk).toString("utf8");
  return text;
}

async function firstLinePid(stream) {
  let text = "";
  for await (const chunk of stream) {
    text += Buffer.from(chunk).toString("utf8");
    if (text.includes("\\n")) break;
  }
  return Number(text.split("\\n")[0]);
}

function must(started) {
  if (!started.ok) throw new Error(started.failure.message);
  return started.value;
}

for (const signal of ["SIGTERM", "SIGKILL"]) {
  const running = must(await nodeRunner()(spec("sh", ["-c", "sleep 300 & echo $!; wait"])));
  const grandchild = await firstLinePid(running.stdout);
  running.signalGroup(signal);
  await running.exited;
  if (!(await goneWithin(grandchild, 2000))) throw new Error("grandchild survived " + signal);
}

const holder = must(await nodeRunner()(spec("sh", ["-c", "sleep 30 & echo $!; echo hi"])));
const began = Date.now();
const [out, err, exit] = await Promise.all([drain(holder.stdout), drain(holder.stderr), holder.exited]);
if (Date.now() - began >= 3000) throw new Error("exited did not resolve before the pipes closed");
if (exit.code !== 0) throw new Error("exit code " + exit.code);
if (err !== "") throw new Error("unexpected stderr");
const [grandchild, hi] = out.split("\\n");
if (hi !== "hi") throw new Error("stdout lost");
if (!(await goneWithin(Number(grandchild), 2000))) throw new Error("holder grandchild survived");
console.log("ok");
`;
}
