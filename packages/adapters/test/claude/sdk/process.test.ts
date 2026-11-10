import { describe, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { defaultTreeDeps, processTree } from "../../../src/claude/engines/sdk-process.ts";

const PARENT_SCRIPT = `
const { spawn } = require("node:child_process");
const grandchild = spawn("sleep", ["120"], { stdio: "ignore" });
process.stdout.write("pid:" + grandchild.pid + "\\n");
process.stderr.write("parent-stderr\\n");
setInterval(() => {}, 1000);
`;

function emitter(child: ChildProcess): NodeJS.EventEmitter {
  return child as unknown as NodeJS.EventEmitter;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function grandchildPid(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => {
    let text = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
      const match = /pid:(\d+)/.exec(text);
      if (match !== null) {
        resolve(Number(match[1]));
      }
    });
  });
}

const FAST = { ...defaultTreeDeps(), killAfterMs: 200, giveUpMs: 4000 };

describe("sdk process tree", () => {
  test("after the leader is stopped the reap waits for the descendants and kills what is left", async () => {
    const tree = processTree(FAST);
    const abort = new AbortController();
    const child = tree.spawn({ command: process.execPath, args: ["-e", PARENT_SCRIPT], env: { PATH: process.env["PATH"] }, signal: abort.signal });
    emitter(child).on("error", () => undefined);
    const pid = await grandchildPid(child);
    expect(alive(pid)).toBe(true);
    abort.abort();
    await tree.reap();
    expect(alive(pid)).toBe(false);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(tree.stderrTail()).toContain("parent-stderr");
  }, 20_000);

  test("a reap with nothing spawned returns at once", async () => {
    await processTree(FAST).reap();
  });

  test("a tree that already exited is reaped without waiting", async () => {
    const tree = processTree(FAST);
    const child = tree.spawn({ command: process.execPath, args: ["-e", "process.exit(0)"], env: { PATH: process.env["PATH"] }, signal: new AbortController().signal });
    await new Promise((resolve) => emitter(child).once("exit", resolve));
    const started = Date.now();
    await tree.reap();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("on a platform without process groups the reap does nothing", async () => {
    const tree = processTree({ ...FAST, platform: "win32" });
    const child = tree.spawn({ command: process.execPath, args: ["-e", "process.exit(0)"], env: { PATH: process.env["PATH"] }, signal: new AbortController().signal });
    await new Promise((resolve) => emitter(child).once("exit", resolve));
    await tree.reap();
  });

  test("the stderr tail is bounded", async () => {
    const tree = processTree(FAST);
    const child = tree.spawn({ command: process.execPath, args: ["-e", "process.stderr.write('x'.repeat(20000))"], env: { PATH: process.env["PATH"] }, signal: new AbortController().signal });
    await new Promise((resolve) => emitter(child).once("exit", resolve));
    await tree.reap();
    expect(tree.stderrTail().length).toBeLessThanOrEqual(8192);
    expect(tree.stderrTail().length).toBeGreaterThan(0);
  });
});
