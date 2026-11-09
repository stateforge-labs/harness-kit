import type { RunFailure } from "../core/failure.ts";
import type { Result } from "../core/result.ts";
import { fail } from "../core/result.ts";
import type { RunEvent } from "../core/run.ts";
import { abortedFailure } from "./finish.ts";
import { lineAssembler } from "./lines.ts";
import type { CliEngine } from "./port.ts";
import { supervise, type SuperviseDone, type SuperviseInput } from "./supervise.ts";

export interface Progress {
  streamed: boolean;
}

function textEvent<I extends string>(engine: CliEngine<I>, line: string, redact: (text: string) => string, progress: Progress): RunEvent | null {
  const text = engine.textOf(redact(line));
  if (text === null) {
    return null;
  }
  progress.streamed = true;
  return { kind: "text", text: redact(text) };
}

export async function* pumpRun<I extends string>(
  input: SuperviseInput,
  engine: CliEngine<I>,
  progress: Progress,
): AsyncGenerator<RunEvent, Result<SuperviseDone, RunFailure>, undefined> {
  const lines = lineAssembler();
  const supervised = supervise(input);
  let finished = false;
  try {
    for (;;) {
      const step = await supervised.next();
      if (step.done === true) {
        finished = true;
        for (const line of lines.flush()) {
          const event = textEvent(engine, line, input.redact, progress);
          if (event !== null) {
            yield event;
          }
        }
        return step.value;
      }
      for (const line of lines.push(step.value)) {
        const event = textEvent(engine, line, input.redact, progress);
        if (event !== null) {
          yield event;
        }
      }
    }
  } finally {
    if (!finished) {
      await supervised.return(fail(abortedFailure()));
    }
  }
}
