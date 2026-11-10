import type { HarnessId } from "@stateforge-labs/harness-hooks";
import type { AgentEngineImpl } from "../agent/engine.ts";
import type { Clock, RuntimeFs } from "../core/io.ts";
import type { Result } from "../core/result.ts";
import type { LibraryEvent } from "../core/run.ts";
import type { EnvSource } from "../env.ts";
import type { Signal, SpawnCode } from "./constants.ts";
import type { Drivers, ProcessExit } from "./port.ts";

export type { Clock, DirEntryInfo, RuntimeFs } from "../core/io.ts";
export type { ProcessExit } from "./port.ts";

export interface ProcessSpec {
  readonly program: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdin: string | null;
}

export interface RunningProcess {
  readonly pid: number | null;
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: AsyncIterable<Uint8Array>;
  readonly exited: Promise<ProcessExit>;
  signalGroup(signal: Signal): void;
}

export interface SpawnError {
  readonly code: SpawnCode;
  readonly message: string;
}

export type ProcessRunner = (spec: ProcessSpec) => Promise<Result<RunningProcess, SpawnError>>;

export interface RuntimeConfig<H extends string = HarnessId> {
  readonly env?: (base: EnvSource) => EnvSource;
  readonly source?: EnvSource;
  readonly spawn?: ProcessRunner;
  readonly fs?: RuntimeFs;
  readonly clock?: Clock;
  readonly platform?: string;
  readonly cwd?: () => string;
  readonly onEvent?: (event: LibraryEvent) => void;
  readonly drivers?: Drivers<H>;
  readonly allowedModes?: readonly string[];
  readonly agentEngines?: Partial<{ readonly [K in H]: AgentEngineImpl<K> }>;
}
