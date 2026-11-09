import { type Capabilities, Engine } from "../core/capability.ts";
import { resolveTools } from "../core/policy.ts";
import type { ResolvedOptions } from "../core/raw-run.ts";
import { measuredValue } from "../core/evidence.ts";
import type { CredentialOf, CredentialSpec, PolicyNotice } from "../core/credential.ts";
import type { RunFailure } from "../core/failure.ts";
import type { CredentialInspection } from "../core/inspect.ts";
import { fail, type Result } from "../core/result.ts";
import { ambientOf } from "./ambient.ts";
import type { Availability, ProbeIo } from "./create-runtime.ts";
import { AvailabilityReason, DirKind, PLACEHOLDER_OUT_FILE, PLACEHOLDER_RUN_ID, PROMPT_PROBE_CWD, PROMPT_PROBE_TEXT, RuntimeLabel } from "./constants.ts";
import type { RuntimeContext } from "./context.ts";
import { dropDir } from "./dirs.ts";
import { probeEnv } from "./env-plan.ts";
import { execute, captureThrow, guardSync, settle } from "./execute.ts";
import { unknownFailure } from "./finish.ts";
import { sweepDirs } from "./isolation.ts";
import { versionOf, type ProbeScope } from "./probe.ts";
import type { Drivers, HarnessDriver } from "./port.ts";
import { locateBinary } from "./binary.ts";

const noop = (): void => {};

export function lookupDriver<H extends string>(drivers: Drivers<H>, id: string): HarnessDriver<H> | null {
  if (!Object.hasOwn(drivers, id)) {
    return null;
  }
  const found = (drivers as unknown as Readonly<Record<string, HarnessDriver<H> | undefined>>)[id];
  return found ?? null;
}

function abortable<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T | null> {
  if (signal === undefined) {
    return work;
  }
  if (signal.aborted) {
    return Promise.resolve(null);
  }
  let detach: () => void = noop;
  const aborted = new Promise<null>((resolve) => {
    const onAbort = (): void => resolve(null);
    signal.addEventListener("abort", onAbort, { once: true });
    detach = () => signal.removeEventListener("abort", onAbort);
  });
  return Promise.race([work, aborted]).then((winner) => {
    detach();
    return winner;
  });
}

function unlocated(id: string, reason: typeof AvailabilityReason.BinaryMissing | typeof AvailabilityReason.UnknownHarness): Availability {
  return { id, installed: null, bundled: null, reason };
}

async function availableOne<H extends string>(ctx: RuntimeContext, drivers: Drivers<H>, id: string, io: ProbeIo): Promise<Availability> {
  const driver = lookupDriver(drivers, id);
  if (driver === null) {
    return unlocated(id, AvailabilityReason.UnknownHarness);
  }
  const env = probeEnv(ctx.source, ambientOf(id), measuredValue(driver.profile.nestedEnv) ?? []);
  const located = await settle(() => locateBinary(driver.profile.binary, env, ctx.fs));
  if (!located.ok || located.value === null) {
    return unlocated(id, AvailabilityReason.BinaryMissing);
  }
  const path = located.value;
  const scope: ProbeScope = { harness: id, engine: Engine.Cli, env, cwd: ctx.cwd() };
  const versionArgs = measuredValue(driver.profile.cli.versionArgs);
  const pending = versionArgs === null ? Promise.resolve(null) : versionOf(ctx, scope, path, versionArgs, io.timeoutMs);
  const version = await abortable(pending, io.signal);
  return { id, installed: { path, version }, bundled: null, reason: null };
}

export async function available<H extends string>(ctx: RuntimeContext, drivers: Drivers<H>, order: readonly H[], io: ProbeIo): Promise<readonly Availability[]> {
  return Promise.all(
    order.map(async (id) => {
      const probed = await settle(() => availableOne(ctx, drivers, id, io));
      return probed.ok ? probed.value : unlocated(id, AvailabilityReason.BinaryMissing);
    }),
  );
}

export async function sweep(ctx: RuntimeContext, options: { readonly olderThanMs: number }): Promise<void> {
  await settle(() => sweepDirs(ctx.fs, ctx.source, ctx.clock.now(), options.olderThanMs, new Set(ctx.state.liveDirs.keys())));
}

async function closeRuntime(ctx: RuntimeContext): Promise<void> {
  ctx.state.closed = true;
  ctx.state.shutdown.abort();
  await Promise.allSettled([...ctx.state.inflight]);
  for (const [path, kind] of [...ctx.state.liveDirs]) {
    if (kind !== DirKind.Keep) {
      await dropDir(ctx, path);
    }
  }
}

export function makeClose(ctx: RuntimeContext): () => Promise<void> {
  let closing: Promise<void> | null = null;
  return () => {
    closing ??= closeRuntime(ctx);
    return closing;
  };
}

export function credentialFrom<H extends string>(drivers: Drivers<H>, id: string, spec: CredentialSpec): Result<CredentialOf<H>, RunFailure> {
  const driver = lookupDriver(drivers, id);
  if (driver === null) {
    return fail(unknownFailure(id));
  }
  return guardSync(RuntimeLabel.Credential, () => driver.credentials.from(spec));
}

export function policyNotice<H extends string>(drivers: Drivers<H>, id: string, mode: string): PolicyNotice | null {
  const driver = lookupDriver(drivers, id);
  if (driver === null) {
    return null;
  }
  const notice = captureThrow((): PolicyNotice | null => driver.credentials.policyNotice(mode));
  return notice.ok ? notice.value : null;
}

export function inspectCredentials<H extends string>(
  ctx: RuntimeContext,
  drivers: Drivers<H>,
  id: string,
): Promise<Result<CredentialInspection, RunFailure>> {
  const driver = lookupDriver(drivers, id);
  if (driver === null) {
    return Promise.resolve(fail(unknownFailure(id)));
  }
  return execute(RuntimeLabel.Inspect, () => driver.credentials.inspect({ env: ctx.source, fs: ctx.fs, platform: ctx.platform }));
}

export function capabilitiesOf<H extends string>(drivers: Drivers<H>, id: string): Capabilities | null {
  return lookupDriver(drivers, id)?.capabilities ?? null;
}

const PROBE_OPTIONS: ResolvedOptions = {
  model: null,
  effort: null,
  persist: true,
  maxArgvBytes: null,
  cwd: PROMPT_PROBE_CWD,
  tools: resolveTools(undefined, undefined),
};

export function promptLimitOf<H extends string>(drivers: Drivers<H>, id: string, engine: Engine): number | null {
  const driver = lookupDriver(drivers, id);
  const impl = engine === Engine.Sdk ? driver?.run.sdk : driver?.run.cli;
  const mode = driver?.credentials.modes[0];
  if (driver === null || impl === undefined || mode === undefined) {
    return null;
  }
  const described = captureThrow(() =>
    impl.describe?.({
      options: PROBE_OPTIONS,
      credential: { mode } as never,
      instructions: PROMPT_PROBE_TEXT,
      input: PROMPT_PROBE_TEXT,
      outFile: PLACEHOLDER_OUT_FILE,
      runId: PLACEHOLDER_RUN_ID,
    }),
  );
  if (!described.ok || described.value === undefined || !described.value.ok || described.value.value.engine !== Engine.Cli) {
    return null;
  }
  return described.value.value.args.some((arg) => arg.includes(PROMPT_PROBE_TEXT)) ? measuredValue(driver.profile.limits.maxArgBytes) : null;
}
