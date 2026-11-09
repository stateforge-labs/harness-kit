import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HELPER = fileURLToPath(new URL("../../../ci/lib/release-tag.sh", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function run(call: string) {
  const result = spawnSync("bash", ["-c", `. "$1"; ${call}`, "bash", HELPER], { encoding: "utf8", cwd: ROOT });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

describe("ci/lib/release-tag.sh", () => {
  test.each([
    ["harness-hooks-v0.2.0", "packages/hooks", "0.2.0"],
    ["harness-hooks-v10.0.12", "packages/hooks", "10.0.12"],
    ["harness-adapters-v0.1.0", "packages/adapters", "0.1.0"],
    ["v0.1.0", "packages/hooks", "0.1.0"],
  ])("maps %s to %s at %s", (tag, dir, version) => {
    expect(run(`package_for_tag "${tag}"`)).toMatchObject({ status: 0, stdout: dir });
    expect(run(`version_of_tag "${tag}"`)).toMatchObject({ status: 0, stdout: version });
  });

  test.each(["foo", "v0.1", "v0.1.0-rc1", "harness-hooks-v0.2", "harness-adapters-0.1.0", "harness-server-v1.0.0", "harness-adapters-v0.1.0-rc1"])(
    "refuses %s",
    (tag) => {
      const pkg = run(`package_for_tag "${tag}"`);
      expect(pkg.status).toBe(1);
      expect(pkg.stderr).toContain("nothing is published");
      expect(run(`version_of_tag "${tag}"`).status).toBe(1);
    },
  );

  test("reads the minimum of a caret range from a package's dependencies", () => {
    expect(run(`dependency_min_version packages/adapters @stateforge-labs/harness-hooks`)).toMatchObject({
      status: 0,
      stdout: "0.1.0",
    });
  });

  test("refuses a dependency that is not declared", () => {
    const missing = run(`dependency_min_version packages/adapters @stateforge-labs/no-such-package`);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("cannot read a minimum version");
  });
});
