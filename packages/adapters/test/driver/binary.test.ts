import { describe, expect, test } from "bun:test";
import { locateBinary, readVersion } from "../../src/driver/binary.ts";
import { Signal, SpawnCode } from "../../src/driver/constants.ts";
import { EnvVar } from "../../src/env.ts";
import { fail } from "../../src/core/result.ts";
import type { ProcessRunner } from "../../src/driver/ports.ts";
import { fakeClock, fakeFs, fakeProcessRunner } from "../support/fakes.ts";

const TIMEOUT_MS = 10;

function io(spawn: ProcessRunner, clock = fakeClock()) {
  return { spawn, env: {}, cwd: "/work", clock, timeoutMs: TIMEOUT_MS };
}

describe("locateBinary", () => {
  test("returns the first executable match along PATH, skipping empty segments", async () => {
    const fs = fakeFs({ executables: ["/second/tool"] });
    const env = { [EnvVar.Path]: ["", "/first", "/second"].join(":") };
    expect(await locateBinary("tool", env, fs)).toBe("/second/tool");
  });

  test("returns null when nothing on PATH is executable", async () => {
    const fs = fakeFs({ files: { "/bin/tool": "x" } });
    expect(await locateBinary("tool", { [EnvVar.Path]: "/bin" }, fs)).toBeNull();
  });

  test("returns null when PATH is unset", async () => {
    expect(await locateBinary("tool", {}, fakeFs({ executables: ["/bin/tool"] }))).toBeNull();
  });
});

describe("readVersion", () => {
  test("returns the parsed version from stdout on a zero exit", async () => {
    const fake = fakeProcessRunner([{ stdout: "tool 1.2.3\n" }]);
    expect(await readVersion("/bin/tool", ["--version"], io(fake.runner))).toBe("1.2.3");
    expect(fake.specs[0]?.args).toEqual(["--version"]);
    expect(fake.signals).toEqual([Signal.Kill]);
  });

  test("returns null on a non-zero exit", async () => {
    const fake = fakeProcessRunner([{ stdout: "tool 1.2.3\n", code: 2 }]);
    expect(await readVersion("/bin/tool", ["--version"], io(fake.runner))).toBeNull();
  });

  test("returns null when the spawn fails", async () => {
    const spawn: ProcessRunner = async () => fail({ code: SpawnCode.NotFound, message: "missing" });
    expect(await readVersion("/bin/tool", ["--version"], io(spawn))).toBeNull();
  });

  test("returns null and kills the process when the probe times out", async () => {
    const fake = fakeProcessRunner([{ hold: true, ignoreTerm: true }]);
    const clock = fakeClock();
    const pending = readVersion("/bin/tool", ["--version"], io(fake.runner, clock));
    await new Promise((resolve) => setTimeout(resolve, 0));
    clock.advance(TIMEOUT_MS);
    expect(await pending).toBeNull();
    expect(fake.signals).toEqual([Signal.Kill]);
  });

  test("returns null when the output has no version", async () => {
    const fake = fakeProcessRunner([{ stdout: "no digits here" }]);
    expect(await readVersion("/bin/tool", ["--version"], io(fake.runner))).toBeNull();
  });
});

