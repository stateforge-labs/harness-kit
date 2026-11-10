import type { AgentEngineImpl, AgentRunInput } from "../agent/engine.ts";
import { AgentWhy } from "../agent/constants.ts";
import type { Agent, AgentEvent, AgentOptions, AgentOutput, AgentRun, AgentStart } from "../agent/types.ts";
import { ENGINE_CAPABILITY } from "../core/capability.ts";
import type { RunFailure } from "../core/failure.ts";
import type { Result } from "../core/result.ts";
import { secret } from "../core/secret.ts";
import { asSessionId, type SessionId } from "../core/session.ts";
import type { ContractCheck } from "../driver/contract.ts";
import { captureThrow } from "../driver/execute.ts";
import type { EnvSource } from "../env.ts";
import {
  AgentContractCheck,
  AgentContractText,
  BAD_MAX_TURNS,
  CliEngineValue,
  ContractSubject,
  MaxTurnsField,
  PREFIXED_NAME_PATTERN,
  PRICE_FIELD_PATTERN,
  RefusedHookSource,
  StartedKind,
  TerminalKind,
} from "./agent-constants.ts";

/** The one runtime method the suite needs; any Runtime has it. */
export interface AgentRuntime {
  agent(id: string, options: AgentOptions): Result<Agent, RunFailure>;
}

/** A scenario the suite cannot make up for itself: a runtime wired so the engine behaves as the check needs. */
export interface AgentContractScenario {
  readonly runtime: () => AgentRuntime;
  readonly inputs?: () => readonly AgentRunInput[];
}

/** A scenario in which a hook denies the tool `tool`, given as its bare name. */
export interface AgentContractDeny extends AgentContractScenario {
  readonly tool: string;
}

/** What the agent contract runs against. `runtime`, `options` and `id` are enough for the plain checks; the rest wires the checks that must see the engine or make it behave in one specific way. A check whose wiring is missing fails and says what to supply. */
export interface AgentContractSubject {
  readonly runtime: (source?: EnvSource) => AgentRuntime;
  readonly options: AgentOptions;
  readonly id: string;
  readonly inputs?: () => readonly AgentRunInput[];
  readonly engine?: AgentEngineImpl<string>;
  readonly cancel?: AgentContractScenario;
  readonly deny?: AgentContractDeny;
  readonly resumeMiss?: AgentContractScenario;
  readonly deadlineMs?: number;
}

type Timed<T> = { readonly tag: "value"; readonly value: T } | { readonly tag: "timeout" };
type Outcome = Result<AgentOutput, RunFailure>;
type Settled = { readonly tag: "value"; readonly value: Outcome; readonly terminalSeen: boolean } | { readonly tag: "rejected" } | { readonly tag: "timeout" };

interface CancelObserved {
  readonly endedBefore: boolean;
  readonly resolved: boolean;
  readonly terminalSeen: boolean;
}

interface Observed {
  readonly label: string;
  readonly threw: string | null;
  readonly refusal: RunFailure | null;
  readonly events: readonly AgentEvent[];
  readonly eventsEnd: "done" | "threw" | "timeout";
  readonly settled: Settled;
  readonly inputs: readonly AgentRunInput[] | null;
  readonly cancel: CancelObserved | null;
}

interface Observation {
  readonly label: string;
  readonly runtime: AgentRuntime;
  readonly id: string;
  readonly options: AgentOptions;
  readonly start: AgentStart;
  readonly inputs: (() => readonly AgentRunInput[]) | undefined;
  readonly cancel: boolean;
  readonly deadlineMs: number;
}

type Finished = Extract<AgentEvent, { readonly kind: "finished" }>;

function within<T>(promise: Promise<T>, ms: number): Promise<Timed<T>> {
  return new Promise<Timed<T>>((resolve) => {
    const timer = setTimeout(() => resolve({ tag: "timeout" }), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ tag: "value", value });
      },
      () => {
        clearTimeout(timer);
        resolve({ tag: "timeout" });
      },
    );
  });
}

function tick(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ContractSubject.SettleTickMs));
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : String(error);
}

function isTerminal(event: AgentEvent): event is Finished {
  return event.kind === TerminalKind;
}

function terminalOf(observed: Observed): Outcome | null {
  const found = observed.events.find(isTerminal);
  return found === undefined ? null : found.result;
}

function failureOf(observed: Observed): RunFailure | null {
  if (observed.refusal !== null) {
    return observed.refusal;
  }
  const terminal = terminalOf(observed);
  return terminal !== null && !terminal.ok ? terminal.failure : null;
}

function jsonOf(value: unknown): string {
  const text = captureThrow(() => JSON.stringify(value));
  return text.ok ? (text.value ?? "") : "";
}

function dump(observed: Observed): string {
  return jsonOf({ refusal: observed.refusal, events: observed.events, settled: observed.settled });
}

function empty(spec: Observation, over: Partial<Observed>): Observed {
  return { label: spec.label, threw: null, refusal: null, events: [], eventsEnd: "done", settled: { tag: "timeout" }, inputs: spec.inputs?.() ?? null, cancel: null, ...over };
}

async function observe(spec: Observation): Promise<Observed> {
  const made = captureThrow(() => spec.runtime.agent(spec.id, spec.options));
  if (!made.ok) {
    return empty(spec, { threw: made.errorName });
  }
  if (!made.value.ok) {
    return empty(spec, { refusal: made.value.failure });
  }
  const agent = made.value.value;
  const started = captureThrow((): AgentRun => agent.start(spec.start));
  if (!started.ok) {
    return empty(spec, { threw: started.errorName });
  }
  const run = started.value;
  const events: AgentEvent[] = [];
  let wake: () => void = () => {};
  const firstEvent = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const settledP = run.settled.then(
    async (value): Promise<Settled> => {
      await tick();
      return { tag: "value", value, terminalSeen: events.some(isTerminal) };
    },
    (): Settled => ({ tag: "rejected" }),
  );
  const eventsP = (async (): Promise<void> => {
    for await (const event of run.events) {
      events.push(event);
      wake();
    }
  })().then(
    () => "done" as const,
    () => "threw" as const,
  );
  let cancel: CancelObserved | null = null;
  if (spec.cancel) {
    await within(firstEvent, spec.deadlineMs);
    const endedBefore = events.some(isTerminal);
    if (!endedBefore) {
      const cancelled = await within(
        Promise.resolve().then(() => run.cancel()),
        spec.deadlineMs,
      );
      cancel = { endedBefore, resolved: cancelled.tag === "value", terminalSeen: events.some(isTerminal) };
    } else {
      cancel = { endedBefore, resolved: false, terminalSeen: true };
    }
  }
  const ended = await within(eventsP, spec.deadlineMs);
  const settled = await within(settledP, spec.deadlineMs);
  return {
    label: spec.label,
    threw: null,
    refusal: null,
    events,
    eventsEnd: ended.tag === "timeout" ? "timeout" : ended.value,
    settled: settled.tag === "timeout" ? { tag: "timeout" } : settled.value,
    inputs: spec.inputs?.() ?? null,
    cancel,
  };
}

function lazy<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | null = null;
  return () => (made ??= make());
}

function secretOptions(options: AgentOptions): AgentOptions {
  return {
    ...options,
    credential: { ...options.credential, key: secret(ContractSubject.SecretKey) },
    env: { ...options.env, set: { ...options.env.set, [ContractSubject.SecretEnvName]: secret(ContractSubject.SecretEnvValue) } },
  };
}

function baseStart(over: Partial<AgentStart> = {}): AgentStart {
  return { instructions: ContractSubject.Instructions, prompt: ContractSubject.Prompt, maxTurns: ContractSubject.MaxTurns, ...over };
}

function resumeId(): SessionId {
  return asSessionId(ContractSubject.ResumeId) as SessionId;
}

function describeFailure(failure: RunFailure | null): string {
  return failure === null ? "none" : failure.kind;
}

function terminalProblems(observed: Observed): readonly string[] {
  if (observed.refusal !== null) {
    return [];
  }
  const out: string[] = [];
  if (observed.threw !== null) {
    out.push(`${observed.label}: ${AgentContractText.Threw}${observed.threw}`);
    return out;
  }
  const count = observed.events.filter(isTerminal).length;
  if (count !== 1) {
    out.push(`${observed.label}: ${AgentContractText.TerminalCount}${count}`);
  }
  return out;
}

function orderProblems(observed: Observed, mustStart: boolean): readonly string[] {
  if (observed.refusal !== null || observed.threw !== null) {
    return [];
  }
  const out: string[] = [];
  const last = observed.events.length - 1;
  const firstTerminal = observed.events.findIndex(isTerminal);
  if (firstTerminal === -1) {
    out.push(`${observed.label}: ${AgentContractText.NoTerminal}`);
  } else if (firstTerminal !== last) {
    out.push(`${observed.label}: ${AgentContractText.TerminalNotLast}`);
  }
  if (mustStart && observed.events[0]?.kind !== StartedKind) {
    out.push(`${observed.label}: ${AgentContractText.StartedNotFirst}`);
  }
  return out;
}

function settledProblems(observed: Observed): readonly string[] {
  if (observed.refusal !== null || observed.threw !== null) {
    return [];
  }
  const label = observed.label;
  const settled = observed.settled;
  if (settled.tag === "rejected") {
    return [`${label}: ${AgentContractText.SettledRejected}`];
  }
  if (settled.tag === "timeout") {
    return [`${label}: ${AgentContractText.SettledTimeout}`];
  }
  const out: string[] = [];
  if (!settled.terminalSeen) {
    out.push(`${label}: ${AgentContractText.SettledTimeout}`);
  }
  const terminal = terminalOf(observed);
  if (terminal !== null && jsonOf(terminal) !== jsonOf(settled.value)) {
    out.push(`${label}: ${AgentContractText.SettledMismatch}`);
  }
  return out;
}

type Lookup = () => Promise<Observed>;

interface Wiring {
  readonly subject: AgentContractSubject;
  readonly deadlineMs: number;
  readonly secrets: AgentOptions;
  readonly base: Lookup;
  readonly badTurns: readonly Lookup[];
  readonly cli: Lookup;
  readonly poisoned: Lookup;
  readonly cancel: Lookup | null;
  readonly deny: Lookup | null;
  readonly recovered: Lookup | null;
  readonly refused: Lookup | null;
}

function wire(subject: AgentContractSubject): Wiring {
  const deadlineMs = subject.deadlineMs ?? ContractSubject.DeadlineMs;
  const secrets = secretOptions(subject.options);
  const make = (label: string, runtime: () => AgentRuntime, inputs: Observation["inputs"], options: AgentOptions, start: AgentStart, cancel = false): Lookup =>
    lazy(() => observe({ label, runtime: runtime(), id: subject.id, options, start, inputs, cancel, deadlineMs }));
  const scenario = (label: string, found: AgentContractScenario | undefined, start: AgentStart, cancel = false): Lookup | null =>
    found === undefined ? null : make(label, found.runtime, found.inputs, secrets, start, cancel);
  const resume = (recoveryPrompt: string | undefined): AgentStart =>
    baseStart({ resume: recoveryPrompt === undefined ? { sessionId: resumeId() } : { sessionId: resumeId(), recoveryPrompt } });
  return {
    subject,
    deadlineMs,
    secrets,
    base: make("base", () => subject.runtime(), subject.inputs, secrets, baseStart()),
    badTurns: BAD_MAX_TURNS.map((turns) => make(`max-turns ${String(turns)}`, () => subject.runtime(), subject.inputs, secrets, { ...baseStart(), maxTurns: turns as number })),
    cli: make("cli", () => subject.runtime(), subject.inputs, { ...secrets, engine: CliEngineValue as unknown as "sdk" }, baseStart()),
    poisoned: make("poisoned", () => subject.runtime({ [ContractSubject.PoisonName]: ContractSubject.PoisonValue }), subject.inputs, secrets, baseStart()),
    cancel: scenario("cancel", subject.cancel, baseStart(), true),
    deny: scenario("deny", subject.deny, baseStart()),
    recovered: scenario("resume-recovered", subject.resumeMiss, resume(ContractSubject.RecoveryPrompt)),
    refused: scenario("resume-refused", subject.resumeMiss, resume(undefined)),
  };
}

async function everyRun(wiring: Wiring): Promise<readonly Observed[]> {
  const lookups = [wiring.base, ...wiring.badTurns, wiring.cli, wiring.cancel, wiring.deny, wiring.recovered, wiring.refused].filter((found): found is Lookup => found !== null);
  const out: Observed[] = [];
  for (const lookup of lookups) {
    out.push(await lookup());
  }
  return out;
}

function missing(what: string): readonly string[] {
  return [`${AgentContractText.MissingScenario}${what}`];
}

async function scenarioProblems(found: Lookup | null, what: string, check: (observed: Observed) => readonly string[]): Promise<readonly string[]> {
  return found === null ? missing(what) : check(await found());
}

function refusalProblems(observed: Observed): readonly string[] {
  if (observed.threw !== null) {
    return [`${observed.label}: ${AgentContractText.Threw}${observed.threw}`];
  }
  return failureOf(observed) === null ? [`${observed.label}: ${AgentContractText.NotRefused}`] : [];
}

function neverStarted(observed: Observed): readonly string[] {
  const out: string[] = [];
  if (observed.inputs !== null && observed.inputs.length > 0) {
    out.push(`${observed.label}: ${AgentContractText.EngineStarted}`);
  }
  if (observed.events.some((event) => event.kind === StartedKind)) {
    out.push(`${observed.label}: ${AgentContractText.StartedEvent}`);
  }
  return out;
}

function maxTurnsProblems(observed: Observed): readonly string[] {
  const failure = failureOf(observed);
  const out: string[] = [...refusalProblems(observed)];
  if (failure !== null) {
    if (failure.kind !== "invalid-config") {
      out.push(`${observed.label}: ${AgentContractText.WrongRefusalKind}${failure.kind}`);
    } else if (!failure.field.includes(MaxTurnsField)) {
      out.push(`${observed.label}: ${AgentContractText.WrongField}${failure.field}`);
    }
  }
  return [...out, ...neverStarted(observed)];
}

function cliProblems(observed: Observed): readonly string[] {
  const failure = failureOf(observed);
  const out: string[] = [...refusalProblems(observed)];
  if (failure !== null) {
    if (failure.kind !== "unsupported") {
      out.push(`${AgentContractText.WrongRefusalKind}${failure.kind}`);
    } else {
      if (failure.capability !== ENGINE_CAPABILITY) {
        out.push(`${AgentContractText.WrongCapability}${failure.capability}`);
      }
      if (failure.why !== AgentWhy.CliEngine) {
        out.push(`${AgentContractText.WrongWhy}${failure.why}`);
      }
    }
  }
  return [...out, ...neverStarted(observed)];
}

function cancelProblems(observed: Observed): readonly string[] {
  const out: string[] = [];
  const cancel = observed.cancel;
  if (cancel === null) {
    return out;
  }
  if (cancel.endedBefore) {
    return [...out, AgentContractText.CancelEnded];
  }
  if (!cancel.resolved) {
    out.push(AgentContractText.CancelNotResolved);
  }
  if (!cancel.terminalSeen) {
    out.push(AgentContractText.CancelBeforeTerminal);
  }
  const failure = failureOf(observed);
  if (failure === null || failure.kind !== "cancelled") {
    out.push(`${AgentContractText.CancelWrongKind}${describeFailure(failure)}`);
  }
  return out;
}

function leakProblems(observed: readonly Observed[], values: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const run of observed) {
    const text = dump(run);
    for (const value of values) {
      if (text.includes(value)) {
        out.push(`${AgentContractText.SecretFound}${run.label}`);
        break;
      }
    }
  }
  return out;
}

function lastInput(observed: Observed): AgentRunInput | null {
  const inputs = observed.inputs;
  return inputs === null || inputs.length === 0 ? null : (inputs[inputs.length - 1] ?? null);
}

function envProblems(observed: Observed, options: AgentOptions): readonly string[] {
  const out: string[] = [];
  const input = lastInput(observed);
  if (input === null) {
    return [`${AgentContractText.MissingInputs}env`];
  }
  for (const [name, value] of Object.entries(input.env)) {
    if (name === ContractSubject.PoisonName || value.includes(ContractSubject.PoisonValue)) {
      out.push(`${AgentContractText.PoisonInEnv}${name}`);
    }
  }
  for (const name of Object.keys(options.env.set)) {
    if (!Object.hasOwn(input.env, name)) {
      out.push(`${AgentContractText.SetNameMissing}${name}`);
    }
  }
  if (dump(observed).includes(ContractSubject.PoisonValue)) {
    out.push(AgentContractText.PoisonInEvents);
  }
  return out;
}

function planProblems(subject: AgentContractSubject, observed: Observed): readonly string[] {
  const input = lastInput(observed);
  if (subject.engine === undefined) {
    return [`${AgentContractText.MissingEngine}describe`];
  }
  if (input === null) {
    return [`${AgentContractText.MissingInputs}describe`];
  }
  const engine = subject.engine;
  const planned = captureThrow(() => engine.describe(input));
  if (!planned.ok) {
    return [`${AgentContractText.Threw}${planned.errorName}`];
  }
  if (!planned.value.ok) {
    return [AgentContractText.DescribeFailed];
  }
  const plan = planned.value.value;
  const text = jsonOf(plan);
  const out: string[] = [];
  if (plan.engine !== "sdk") {
    out.push(`${AgentContractText.DescribeEngine}${plan.engine}`);
  }
  for (const [name, value] of Object.entries(input.env)) {
    if (value.length >= ContractSubject.MinDescribeValueLength && text.includes(value)) {
      out.push(`${AgentContractText.DescribeValue}${name}`);
    }
  }
  return out;
}

function denyProblems(observed: Observed, tool: string): readonly string[] {
  const refused = observed.events.filter((event) => event.kind === "refused");
  if (refused.length === 0) {
    return [AgentContractText.NoRefusedEvent];
  }
  const out: string[] = [];
  const ids = new Set<string>();
  if (!refused.some((event) => event.tool === tool)) {
    out.push(`${AgentContractText.RefusedTool}${tool}`);
  }
  for (const event of refused) {
    if (event.source !== RefusedHookSource) {
      out.push(AgentContractText.RefusedSource);
    }
    if (PREFIXED_NAME_PATTERN.test(event.tool) || event.tool === "") {
      out.push(`${AgentContractText.RefusedTool}${tool}`);
    }
    if (event.id === "" || event.reason === "") {
      out.push(AgentContractText.RefusedBlank);
    }
    if (ids.has(event.id)) {
      out.push(AgentContractText.RefusedDuplicate);
    }
    ids.add(event.id);
  }
  return [...new Set(out)];
}

function usageEvents(observed: Observed): readonly Extract<AgentEvent, { readonly kind: "usage" }>[] {
  return observed.events.filter((event) => event.kind === "usage");
}

function usageProblems(observed: Observed): readonly string[] {
  const events = usageEvents(observed);
  if (events.length === 0) {
    return [AgentContractText.NoUsage];
  }
  const out: string[] = [];
  let previous = 0;
  for (const event of events) {
    if (!Number.isInteger(event.turn) || event.turn < 1 || event.turn <= previous) {
      out.push(`${AgentContractText.UsageTurn}${event.turn}`);
    }
    previous = event.turn;
    for (const count of [event.input, event.cacheWrite, event.cacheRead, event.output]) {
      if (!Number.isInteger(count) || count < 0) {
        out.push(`${AgentContractText.UsageTokens}${String(count)}`);
      }
    }
  }
  const terminal = terminalOf(observed);
  if (terminal !== null && terminal.ok && terminal.value.usage.length !== events.length) {
    out.push(`${AgentContractText.UsageCount}${events.length} and ${terminal.value.usage.length}`);
  }
  return out;
}

function priceProblems(observed: Observed): readonly string[] {
  const holders: object[] = [...usageEvents(observed)];
  const terminal = terminalOf(observed);
  if (terminal !== null && terminal.ok) {
    holders.push(terminal.value, ...terminal.value.usage);
  }
  const out: string[] = [];
  for (const holder of holders) {
    for (const key of Object.keys(holder)) {
      if (PRICE_FIELD_PATTERN.test(key)) {
        out.push(`${AgentContractText.PriceField}${key}`);
      }
    }
  }
  return [...new Set(out)];
}

function sessionProblems(observed: Observed): readonly string[] {
  const sessions = observed.events.filter((event) => event.kind === "session");
  if (sessions.length === 0) {
    return [AgentContractText.NoSession];
  }
  const out: string[] = [];
  for (const event of sessions) {
    if (typeof event.id !== "string" || event.id === "") {
      out.push(AgentContractText.SessionId);
    }
    if (!Object.hasOwn(event, "checkpoint") || (event.checkpoint !== null && typeof event.checkpoint !== "string")) {
      out.push(AgentContractText.SessionCheckpoint);
    }
  }
  const terminal = terminalOf(observed);
  const last = sessions[sessions.length - 1];
  if (terminal !== null && terminal.ok && last !== undefined && terminal.value.sessionId !== last.id) {
    out.push(AgentContractText.SessionMismatch);
  }
  return [...new Set(out)];
}

function recoveredProblems(observed: Observed): readonly string[] {
  const out: string[] = [...terminalProblems(observed)];
  const recovered = observed.events.filter((event) => event.kind === "recovered");
  if (recovered.length !== 1) {
    out.push(`${AgentContractText.RecoveredCount}${recovered.length}`);
  }
  if (recovered.some((event) => event.reason !== "session-not-found")) {
    out.push(AgentContractText.RecoveredReason);
  }
  const at = observed.events.findIndex((event) => event.kind === "recovered");
  const early = new Set<string>(["text", "usage", "tool", "output", "session", "turn"]);
  if (at !== -1 && observed.events.slice(0, at).some((event) => early.has(event.kind))) {
    out.push(AgentContractText.RecoveredNotBeforeText);
  }
  const terminal = terminalOf(observed);
  if (terminal === null || !terminal.ok) {
    out.push(AgentContractText.RecoveryFailed);
  }
  if (observed.inputs !== null) {
    const second = observed.inputs[1];
    if (observed.inputs.length !== 2) {
      out.push(`${AgentContractText.FreshRuns}${observed.inputs.length}`);
    } else if (second !== undefined) {
      if (second.start.resume !== undefined) {
        out.push(AgentContractText.FreshResume);
      }
      if (second.start.prompt !== ContractSubject.RecoveryPrompt) {
        out.push(AgentContractText.FreshPrompt);
      }
    }
  }
  return out;
}

function unrecoveredProblems(observed: Observed): readonly string[] {
  const out: string[] = [...terminalProblems(observed)];
  if (observed.events.some((event) => event.kind === "recovered")) {
    out.push(`${AgentContractText.RecoveredCount}1`);
  }
  const failure = failureOf(observed);
  if (failure === null || failure.kind !== "session-not-found") {
    out.push(`${AgentContractText.WrongRefusalKind}${describeFailure(failure)}`);
  } else if (failure.sessionId !== ContractSubject.ResumeId) {
    out.push(AgentContractText.WrongSessionId);
  }
  if (observed.inputs !== null && observed.inputs.length !== 1) {
    out.push(`${AgentContractText.FreshRuns}${observed.inputs.length}`);
  }
  return out;
}

async function judged(name: AgentContractCheck, work: () => Promise<readonly string[]>): Promise<ContractCheck> {
  const done = await work().then(
    (problems) => ({ problems }),
    (error: unknown) => ({ problems: [`${AgentContractText.Threw}${nameOf(error)}`] }),
  );
  const problems = [...new Set(done.problems)];
  return { name, ok: problems.length === 0, detail: problems.length === 0 ? AgentContractText.Pass : problems.join(AgentContractText.Separator) };
}

/** The checks every agent engine must pass, run through `subject.runtime()`: exactly one terminal event and it is last; `settled` never rejects and equals the terminal result; cancel ends as cancelled; `maxTurns` is required; a cli agent run is refused before anything starts; no secret reaches events, failures or a description; the child env is closed; a deny becomes a refused event with the bare tool name; usage is raw per message and priceless; session events carry id and checkpoint; a resume miss recovers only with a recovery prompt. The same suite runs against the fake engine and against a real one. */
export async function agentContract(subject: AgentContractSubject): Promise<readonly ContractCheck[]> {
  const wiring = wire(subject);
  const runs = (): Promise<readonly Observed[]> => everyRun(wiring);
  const checks: ContractCheck[] = [];
  checks.push(await judged(AgentContractCheck.OneTerminalEvent, async () => (await runs()).flatMap(terminalProblems)));
  checks.push(
    await judged(AgentContractCheck.EventsOrder, async () => {
      const out: string[] = [];
      for (const lookup of [wiring.base, wiring.cancel, wiring.deny]) {
        if (lookup !== null) {
          out.push(...orderProblems(await lookup(), true));
        }
      }
      for (const observed of await runs()) {
        out.push(...orderProblems(observed, false));
      }
      return out;
    }),
  );
  checks.push(await judged(AgentContractCheck.SettledNeverRejects, async () => (await runs()).flatMap(settledProblems)));
  checks.push(await judged(AgentContractCheck.CancelCancelled, () => scenarioProblems(wiring.cancel, "cancel", cancelProblems)));
  checks.push(
    await judged(AgentContractCheck.MaxTurnsRequired, async () => {
      const out: string[] = [];
      for (const lookup of wiring.badTurns) {
        out.push(...maxTurnsProblems(await lookup()));
      }
      return out;
    }),
  );
  checks.push(await judged(AgentContractCheck.CliEngineUnsupported, async () => cliProblems(await wiring.cli())));
  checks.push(await judged(AgentContractCheck.NoSecretLeak, async () => leakProblems(await runs(), [ContractSubject.SecretKey, ContractSubject.SecretEnvValue])));
  checks.push(await judged(AgentContractCheck.ClosedEnv, async () => envProblems(await wiring.poisoned(), subject.options)));
  checks.push(await judged(AgentContractCheck.DescribeNamesOnly, async () => planProblems(subject, await wiring.base())));
  checks.push(await judged(AgentContractCheck.DenyRefused, () => scenarioProblems(wiring.deny, "deny", (observed) => denyProblems(observed, subject.deny?.tool ?? ""))));
  checks.push(await judged(AgentContractCheck.UsagePerMessage, async () => usageProblems(await wiring.base())));
  checks.push(await judged(AgentContractCheck.UsageNoPrice, async () => priceProblems(await wiring.base())));
  checks.push(await judged(AgentContractCheck.SessionEvent, async () => sessionProblems(await wiring.base())));
  checks.push(await judged(AgentContractCheck.ResumeMissRecovered, () => scenarioProblems(wiring.recovered, "resumeMiss", recoveredProblems)));
  checks.push(await judged(AgentContractCheck.ResumeMissRefused, () => scenarioProblems(wiring.refused, "resumeMiss", unrecoveredProblems)));
  return checks;
}
