import type { HarnessId } from "@stateforge-labs/harness-hooks";
import { type Plan, type RunEvent, type RunOutput, type RunRequest, type HeadlessOptions } from "../core/run.ts";
import type { RunFailure } from "../core/failure.ts";
import { fail, type Result } from "../core/result.ts";
import { HandleLabel } from "./constants.ts";
import { track, type RuntimeContext } from "./context.ts";
import { execute, guardStream, guardSync } from "./execute.ts";
import { closedFailure, noResult, unknownFailure } from "./finish.ts";
import type { HarnessDriver } from "./port.ts";
import { setupRun } from "./setup.ts";
import { streamRun } from "./stream.ts";

export interface HeadlessHandle<I extends string = HarnessId> {
  readonly id: I;
  plan(request: RunRequest): Result<Plan, RunFailure>;
  run(request: RunRequest): Promise<Result<RunOutput, RunFailure>>;
  stream(request: RunRequest): AsyncIterable<RunEvent>;
}

async function* gated<I extends string>(
  ctx: RuntimeContext,
  driver: HarnessDriver<I> | null,
  id: I,
  options: HeadlessOptions<I>,
  request: RunRequest,
): AsyncGenerator<RunEvent> {
  if (ctx.state.closed) {
    yield { kind: "finished", result: fail(closedFailure()) };
    return;
  }
  if (driver === null) {
    yield { kind: "finished", result: fail(unknownFailure(id)) };
    return;
  }
  yield* streamRun(ctx, driver, options, request);
}

async function drain(events: AsyncIterable<RunEvent>): Promise<Result<RunOutput, RunFailure>> {
  let last: Result<RunOutput, RunFailure> | null = null;
  for await (const event of events) {
    if (event.kind === "finished") {
      last = event.result;
    }
  }
  return last ?? fail(noResult());
}

export function makeHandle<I extends string>(
  ctx: RuntimeContext,
  driver: HarnessDriver<I> | null,
  id: I,
  options: HeadlessOptions<I>,
): HeadlessHandle<I> {
  const stream = (request: RunRequest): AsyncIterable<RunEvent> =>
    guardStream(HandleLabel.Stream, () => gated(ctx, driver, id, options, request));
  return {
    id,
    plan(request) {
      if (ctx.state.closed) {
        return fail(closedFailure());
      }
      if (driver === null) {
        return fail(unknownFailure(id));
      }
      return guardSync<Plan>(HandleLabel.Plan, () => {
        const setup = setupRun(ctx, driver, options, request);
        return setup.ok ? { ok: true, value: setup.value.prepared.plan } : fail(setup.failure);
      });
    },
    run(request) {
      return track(ctx, execute(HandleLabel.Run, () => drain(stream(request))));
    },
    stream,
  };
}
