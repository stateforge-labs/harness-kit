import type { RunFailure } from "../../src/core/failure.ts";
import { fail, ok, type Result } from "../../src/core/result.ts";
import type { EngineInput, Invocation } from "../../src/driver/port.ts";

export function fakeInvocationOnly(input: EngineInput<"fake">): Result<Invocation, RunFailure> {
  if (input.runId === "") {
    return fail({ kind: "aborted", message: "no run id" });
  }
  return ok({ program: "fake-cli", args: [], stdin: input.input, outFile: input.outFile, argvCarries: [] });
}
