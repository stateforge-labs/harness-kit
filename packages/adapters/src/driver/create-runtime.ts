import type { HarnessId } from "@stateforge-labs/harness-hooks";
import { type Capabilities, Engine } from "../core/capability.ts";
import { type CredentialOf, type CredentialSpec, type PolicyNotice } from "../core/credential.ts";
import type { RunFailure } from "../core/failure.ts";
import type { CredentialInspection } from "../core/inspect.ts";
import type { HeadlessOptions } from "../core/run.ts";
import type { Result } from "../core/result.ts";
import { AvailabilityReason } from "./constants.ts";
import { newState, type RuntimeContext } from "./context.ts";
import { captureThrow } from "./execute.ts";
import { type HeadlessHandle, makeHandle } from "./handle.ts";
import type { Drivers, HarnessDriver } from "./port.ts";
import type { RuntimeConfig } from "./ports.ts";
import { defaultCwd, defaultPlatform, nodeClock, nodeFs, nodeRunner } from "./node-defaults.ts";
import { available, capabilitiesOf, credentialFrom, inspectCredentials, lookupDriver, makeClose, policyNotice, promptLimitOf, sweep } from "./runtime-ops.ts";
import { type EnvSource, processEnv } from "../env.ts";

/** The time and cancellation budget of an availability probe. */
export interface ProbeIo {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

/** Whether one harness binary is installed, with its path and version. */
export interface Availability {
  readonly id: string;
  readonly installed: { readonly path: string; readonly version: string | null } | null;
  readonly bundled: null;
  readonly reason: (typeof AvailabilityReason)[keyof typeof AvailabilityReason] | null;
}

/** A runtime over a set of harness drivers: headless runs, credentials, probes and cleanup. */
export interface Runtime<H extends string = HarnessId> extends AsyncDisposable {
  driver<I extends H>(id: I): HarnessDriver<I>;
  driver(id: string): HarnessDriver | null;
  available(order: readonly H[], io: ProbeIo): Promise<readonly Availability[]>;
  headless<I extends H>(id: I, options: HeadlessOptions<I>): HeadlessHandle<I>;
  credentialFrom<I extends H>(id: I, spec: CredentialSpec): Result<CredentialOf<I>, RunFailure>;
  policyNotice(id: H, mode: string): PolicyNotice | null;
  inspectCredentials(id: H): Promise<Result<CredentialInspection, RunFailure>>;
  promptLimit(id: H, engine?: Engine): number | null;
  capabilities(id: H): Capabilities | null;
  sweep(options: { readonly olderThanMs: number }): Promise<void>;
  close(): Promise<void>;
}

function snapshotOf(source: EnvSource | undefined): EnvSource {
  const taken = captureThrow((): EnvSource => Object.freeze({ ...(source ?? processEnv()) }));
  return taken.ok ? taken.value : Object.freeze({});
}

export function contextOf<H extends string>(config: RuntimeConfig<H>): RuntimeContext {
  const platform = config.platform ?? defaultPlatform();
  return {
    source: snapshotOf(config.source),
    envTransform: config.env,
    runner: config.spawn ?? nodeRunner(platform),
    fs: config.fs ?? nodeFs,
    clock: config.clock ?? nodeClock,
    platform,
    cwd: config.cwd ?? defaultCwd,
    onEvent: config.onEvent,
    allowedModes: config.allowedModes,
    state: newState(),
  };
}

export function buildRuntime<H extends string>(drivers: Drivers<H>, config: RuntimeConfig<H>): Runtime<H> {
  const ctx = contextOf(config);
  const close = makeClose(ctx);
  const runtime = {
    driver: (id: string) => lookupDriver(drivers, id),
    available: (order: readonly H[], io: ProbeIo) => available(ctx, drivers, order, io),
    headless: <I extends H>(id: I, options: HeadlessOptions<I>): HeadlessHandle<I> => makeHandle<I>(ctx, lookupDriver(drivers, id) as HarnessDriver<I> | null, id, options),
    credentialFrom: <I extends H>(id: I, spec: CredentialSpec) => credentialFrom(drivers, id, spec) as Result<CredentialOf<I>, RunFailure>,
    policyNotice: (id: H, mode: string) => policyNotice(drivers, id, mode),
    inspectCredentials: (id: H) => inspectCredentials(ctx, drivers, id),
    promptLimit: (id: H, engine: Engine = Engine.Cli) => promptLimitOf(drivers, id, engine),
    capabilities: (id: H) => capabilitiesOf(drivers, id),
    sweep: (options: { readonly olderThanMs: number }) => sweep(ctx, options),
    close,
    [Symbol.asyncDispose]: close,
  };
  return runtime as unknown as Runtime<H>;
}

