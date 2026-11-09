import { describe, expect, test } from "bun:test";
import type { RunFailure } from "../../src/core/failure.ts";
import { fail, ok } from "../../src/core/result.ts";
import type { LibraryEvent, RunEvent } from "../../src/core/run.ts";
import { UnavailableReason } from "../../src/core/failure.ts";
import { captureThrow, execute, guardStream, safeEmit } from "../../src/driver/execute.ts";

function named(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

async function drain(source: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for await (const event of source) {
    events.push(event);
  }
  return events;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const EVENT: LibraryEvent = { kind: "credential-plan", harness: "h", mode: "m", injected: [], stripped: [] };

describe("execute", () => {
  test("passes the result through", async () => {
    expect(await execute("run", async () => ok(1))).toEqual({ ok: true, value: 1 });
  });

  test("a throw becomes internal-error naming the error, not its message", async () => {
    const result = await execute("run", async (): Promise<never> => {
      throw named("TypeError", "sentinel detail");
    });
    expect(result).toEqual({
      ok: false,
      failure: {
        kind: "unavailable",
        message: "run failed: TypeError",
        reason: UnavailableReason.InternalError,
      },
    });
    expect(JSON.stringify(result)).not.toContain("sentinel");
  });

  test("a rejection becomes internal-error", async () => {
    const result = await execute("run", () => Promise.reject(named("RangeError", "sentinel")));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.failure as RunFailure).message).toBe("run failed: RangeError");
    }
  });
});

describe("guardStream", () => {
  test("passes events through unchanged", async () => {
    const events = await drain(
      guardStream("run", async function* () {
        yield { kind: "text", text: "a" };
      }),
    );
    expect(events).toEqual([{ kind: "text", text: "a" }]);
  });

  test("yields a final finished event when the source throws", async () => {
    const events = await drain(
      guardStream("run", async function* (): AsyncGenerator<RunEvent> {
        yield { kind: "text", text: "a" };
        throw named("RangeError", "sentinel");
      }),
    );
    expect(events[0]).toEqual({ kind: "text", text: "a" });
    expect(events[1]).toEqual({
      kind: "finished",
      result: fail({
        kind: "unavailable",
        message: "run failed: RangeError",
        reason: UnavailableReason.InternalError,
      }),
    });
    expect(events).toHaveLength(2);
  });

  test("returning the guard returns the source", async () => {
    let returned = false;
    const guarded = guardStream("run", async function* (): AsyncGenerator<RunEvent> {
      try {
        yield { kind: "text", text: "a" };
        yield { kind: "text", text: "b" };
      } finally {
        returned = true;
      }
    });
    await guarded.next();
    await guarded.return(undefined);
    expect(returned).toBe(true);
  });
});

describe("captureThrow", () => {
  test("returns the error name only", () => {
    const captured = captureThrow((): number => {
      throw named("SyntaxError", "secret message");
    });
    expect(captured).toEqual({ ok: false, errorName: "SyntaxError" });
    expect(JSON.stringify(captured)).not.toContain("secret");
  });

  test("returns the value when nothing throws", () => {
    expect(captureThrow(() => 7)).toEqual({ ok: true, value: 7 });
  });
});

describe("safeEmit", () => {
  test("survives a synchronous throw", () => {
    expect(() =>
      safeEmit(() => {
        throw new Error("x");
      }, EVENT),
    ).not.toThrow();
  });

  test("survives an asynchronous rejection", async () => {
    safeEmit(async () => {
      throw new Error("y");
    }, EVENT);
    await flush();
  });

  test("delivers the event to a handler", () => {
    const seen: LibraryEvent[] = [];
    safeEmit((event) => {
      seen.push(event);
    }, EVENT);
    expect(seen).toEqual([EVENT]);
  });
});
