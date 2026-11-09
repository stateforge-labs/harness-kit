import { describe, expect, test } from "bun:test";
import { makeHandle } from "../../src/driver/handle.ts";
import { PLACEHOLDER_RUN_ID } from "../../src/driver/constants.ts";
import { chunkedRunner, type ChunkScript } from "../support/chunked-runner.ts";
import { options, request } from "../support/prepare.ts";
import { runtimeCtx } from "../support/runtime.ts";
import { driverWith } from "../support/variants.ts";
import { fakeInvocationOnly } from "../support/engine-parts.ts";

const VERSION: ChunkScript = { chunks: ["fake-cli 1.2.3\n"] };
const TEXT: ChunkScript = { chunks: ["text:hi\n"] };

function recordingDriver(seen: string[]) {
  return driverWith({
    cli: {
      invocation: (input) => {
        seen.push(input.runId);
        return fakeInvocationOnly(input);
      },
    },
  });
}

describe("run ids", () => {
  test("every build gets a distinct run id and plan uses the placeholder", async () => {
    const seen: string[] = [];
    const chunked = chunkedRunner([VERSION, TEXT, TEXT]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const handle = makeHandle(ctx, recordingDriver(seen), "fake", options());
    handle.plan(request());
    await handle.run(request());
    await handle.run(request());
    const runs = seen.filter((id) => id !== PLACEHOLDER_RUN_ID);
    expect(seen[0]).toBe(PLACEHOLDER_RUN_ID);
    expect(runs).toHaveLength(2);
    expect(new Set(runs).size).toBe(2);
  });
});
