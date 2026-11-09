import { type RunFailure, UnavailableReason } from "../core/failure.ts";
import { fail, type Result } from "../core/result.ts";
import type { LibraryEvent, RunEvent } from "../core/run.ts";
import { ExecuteText } from "./constants.ts";

const ignore = (): void => {};

function nameOf(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
    ? error.name
    : ExecuteText.UnknownName;
}

function internalFailure(label: string, error: unknown): RunFailure {
  return {
    kind: "unavailable",
    message: `${label}${ExecuteText.Failed}${nameOf(error)}`,
    reason: UnavailableReason.InternalError,
  };
}

export async function execute<T>(label: string, work: () => Promise<Result<T, RunFailure>>): Promise<Result<T, RunFailure>> {
  try {
    return await work();
  } catch (error) {
    return fail(internalFailure(label, error));
  }
}

export async function* guardStream(label: string, source: () => AsyncGenerator<RunEvent>): AsyncGenerator<RunEvent> {
  let inner: AsyncGenerator<RunEvent> | null = null;
  try {
    inner = source();
    for (;;) {
      const step = await inner.next();
      if (step.done === true) {
        return;
      }
      yield step.value;
    }
  } catch (error) {
    yield { kind: "finished", result: fail(internalFailure(label, error)) };
  } finally {
    await inner?.return(undefined);
  }
}

export type Captured<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errorName: string };

export function captureThrow<T>(work: () => T): Captured<T> {
  try {
    return { ok: true, value: work() };
  } catch (error) {
    return { ok: false, errorName: nameOf(error) };
  }
}

export function safeEmit(handler: ((event: LibraryEvent) => void) | undefined, event: LibraryEvent): void {
  if (handler === undefined) {
    return;
  }
  try {
    const result: unknown = handler(event);
    if (result !== undefined) {
      void Promise.resolve(result).then(undefined, ignore);
    }
  } catch {
    return;
  }
}
