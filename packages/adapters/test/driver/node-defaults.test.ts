import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Signal, SpawnCode, SystemCode } from "../../src/driver/constants.ts";
import { chunksOf, nodeClock, nodeFs, nodeRunner } from "../../src/driver/node-defaults.ts";
import { PassThrough } from "node:stream";
import type { ProcessSpec } from "../../src/driver/ports.ts";

const LINUX = process.platform === "linux";
const PATH = process.env.PATH ?? "";

function spec(program: string, args: readonly string[], stdin: string | null = null): ProcessSpec {
  return { program, args, env: { PATH }, cwd: tmpdir(), stdin };
}

async function drain(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const parts: Uint8Array[] = [];
  for await (const chunk of stream) {
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString("utf8");
}

function pidOf(line: string): number {
  return Number(line.split("\n")[0]);
}

function isGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === SystemCode.NoProcess;
  }
}

async function goneWithin(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!isGone(pid)) {
    if (Date.now() > deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return true;
}

async function firstLinePid(stream: AsyncIterable<Uint8Array>): Promise<number> {
  let text = "";
  for await (const chunk of stream) {
    text += Buffer.from(chunk).toString("utf8");
    if (text.includes("\n")) {
      break;
    }
  }
  return pidOf(text);
}

describe.skipIf(!LINUX)("nodeRunner on Linux", () => {
  test("captures stdout and stderr and reports a zero exit", async () => {
    const started = await nodeRunner()(spec("sh", ["-c", "printf out; printf err >&2"]));
    if (!started.ok) {
      throw new Error(started.failure.message);
    }
    const [out, err, exit] = await Promise.all([
      drain(started.value.stdout),
      drain(started.value.stderr),
      started.value.exited,
    ]);
    expect(out).toBe("out");
    expect(err).toBe("err");
    expect(exit).toEqual({ code: 0, signal: null });
  });

  test("passes stdin through to the child", async () => {
    const started = await nodeRunner()(spec("sh", ["-c", "cat"], "piped"));
    if (!started.ok) {
      throw new Error(started.failure.message);
    }
    expect(await drain(started.value.stdout)).toBe("piped");
    expect((await started.value.exited).code).toBe(0);
  });

  test("reports a non-zero exit code", async () => {
    const started = await nodeRunner()(spec("sh", ["-c", "exit 3"]));
    if (!started.ok) {
      throw new Error(started.failure.message);
    }
    expect((await started.value.exited).code).toBe(3);
  });

  test("reports a missing program as NotFound", async () => {
    const started = await nodeRunner()(spec("/definitely/missing/program", []));
    expect(started.ok).toBe(false);
    if (!started.ok) {
      expect(started.failure.code).toBe(SpawnCode.NotFound);
    }
  });

  test("a process that closed its own stdio still exits with its code", async () => {
    const started = await nodeRunner()(spec("sh", ["-c", "exec 1>&-; exec 2>&-; exit 3"]));
    if (!started.ok) {
      throw new Error(started.failure.message);
    }
    expect((await started.value.exited).code).toBe(3);
  });

  test("signalGroup kills the whole process group of a running child", async () => {
    const started = await nodeRunner()(spec("sh", ["-c", "sleep 30 & sleep 30"]));
    if (!started.ok) {
      throw new Error(started.failure.message);
    }
    started.value.signalGroup(Signal.Kill);
    const exit = await started.value.exited;
    expect(exit.signal).toBe(Signal.Kill);
  });

  test.each([Signal.Term, Signal.Kill])("signalGroup %s reaches a grandchild", async (signal) => {
    const started = await nodeRunner()(spec("sh", ["-c", "sleep 300 & echo $!; wait"]));
    if (!started.ok) {
      throw new Error(started.failure.message);
    }
    const grandchild = await firstLinePid(started.value.stdout);
    started.value.signalGroup(signal);
    await started.value.exited;
    expect(await goneWithin(grandchild, 2_000)).toBe(true);
  });

  test("exited resolves and both streams end when a descendant holds the pipes open", async () => {
    const started = await nodeRunner()(spec("sh", ["-c", "sleep 30 & echo $!; echo hi"]));
    if (!started.ok) {
      throw new Error(started.failure.message);
    }
    const began = Date.now();
    const [out, err, exit] = await Promise.all([
      drain(started.value.stdout),
      drain(started.value.stderr),
      started.value.exited,
    ]);
    expect(Date.now() - began).toBeLessThan(3_000);
    expect(exit.code).toBe(0);
    expect(err).toBe("");
    const [grandchild, hi] = out.split("\n");
    expect(hi).toBe("hi");
    expect(await goneWithin(Number(grandchild), 2_000)).toBe(true);
  });

  test("stdin null ends the child's stdin without data", async () => {
    const started = await nodeRunner()(spec("sh", ["-c", "cat >/dev/null; echo done"], null));
    if (!started.ok) {
      throw new Error(started.failure.message);
    }
    expect(await drain(started.value.stdout)).toBe("done\n");
    expect((await started.value.exited).code).toBe(0);
  });

  test("reports an oversized argument as ArgvTooBig", async () => {
    const started = await nodeRunner()(spec("sh", ["-c", "true", "x".repeat(3 * 1024 * 1024)]));
    expect(started.ok).toBe(false);
    if (!started.ok) {
      expect(started.failure.code).toBe(SpawnCode.ArgvTooBig);
    }
  });
});

describe("stream errors end iteration", () => {
  test("a stream destroyed with an error ends the iteration without rejecting", async () => {
    const stream = new PassThrough();
    stream.write("first");
    setTimeout(() => stream.destroy(new Error("boom")), 10);
    expect(await drain(chunksOf(stream))).toBe("first");
  });
});

describe.skipIf(!LINUX)("nodeFs", () => {
  test("makes a private temp dir, lists it and removes it", async () => {
    const parent = await mkdtemp(join(tmpdir(), "adapters-fs-"));
    try {
      const dir = await nodeFs.makeTempDir("probe-", parent);
      expect(dir).not.toBeNull();
      if (dir === null) {
        return;
      }
      expect((await stat(dir)).mode & 0o777).toBe(0o700);
      expect(await nodeFs.exists(dir)).toBe(true);
      await writeFile(join(dir, "f.txt"), "hello");
      const entries = await nodeFs.listDir(parent);
      expect(entries?.map((entry) => entry.name)).toEqual([dir.slice(parent.length + 1)]);
      expect(await nodeFs.removeTree(dir)).toBe(true);
      expect(await nodeFs.exists(dir)).toBe(false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("detects executables and reads bounded text", async () => {
    const parent = await mkdtemp(join(tmpdir(), "adapters-bin-"));
    try {
      const exe = join(parent, "tool");
      const plain = join(parent, "data.txt");
      await writeFile(exe, "#!/bin/sh\n");
      await chmod(exe, 0o755);
      await writeFile(plain, "abcdefgh");
      expect(await nodeFs.isExecutable(exe)).toBe(true);
      expect(await nodeFs.isExecutable(plain)).toBe(false);
      expect(await nodeFs.isExecutable(join(parent, "absent"))).toBe(false);
      expect(await nodeFs.readText(plain, 3)).toBe("abc");
      expect(await nodeFs.readText(join(parent, "absent"), 3)).toBeNull();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("listDir reports a missing directory as null", async () => {
    expect(await nodeFs.listDir("/definitely/missing/dir")).toBeNull();
  });
});

describe("nodeClock", () => {
  test("now tracks wall time and after can be cancelled", async () => {
    expect(Math.abs(nodeClock.now() - Date.now())).toBeLessThan(1_000);
    let fired = false;
    const cancel = nodeClock.after(5, () => {
      fired = true;
    });
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fired).toBe(false);
  });
});
