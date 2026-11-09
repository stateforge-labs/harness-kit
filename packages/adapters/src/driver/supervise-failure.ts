import { type RunFailure, UnavailableReason } from "../core/failure.ts";
import { argvBytes, envBytes, LINUX_MAX_ARGV_BYTES } from "../core/limits.ts";
import type { Limits } from "../core/run.ts";
import { EngineMessage, EnvField, ExitCode, SpawnCode, StopReason, SuperviseMessage } from "./constants.ts";
import type { ProcessExit } from "./port.ts";
import type { ProcessSpec, SpawnError } from "./ports.ts";

export type Stop =
  | { readonly kind: typeof StopReason.Timeout; readonly timeoutMs: number }
  | { readonly kind: typeof StopReason.Aborted }
  | { readonly kind: typeof StopReason.OutputTooLarge };

export function spawnFailure(error: SpawnError, spec: ProcessSpec): RunFailure {
  switch (error.code) {
    case SpawnCode.NotFound:
      return { kind: "unavailable", message: SuperviseMessage.BinaryMissing, reason: UnavailableReason.BinaryMissing };
    case SpawnCode.ArgvTooBig:
      return {
        kind: "too-large",
        message: EngineMessage.EnvTooLarge,
        limitBytes: LINUX_MAX_ARGV_BYTES,
        actualBytes: argvBytes(spec.args) + envBytes(spec.env),
        field: EnvField.Environment,
      };
    case SpawnCode.SpawnFailed:
      return { kind: "unavailable", message: SuperviseMessage.SpawnFailed, reason: UnavailableReason.SpawnFailed };
  }
}

export function stopFailure(stop: Stop, stdoutBytes: number, limits: Limits): RunFailure {
  switch (stop.kind) {
    case StopReason.Timeout:
      return { kind: "timeout", message: SuperviseMessage.Timeout, timeoutMs: stop.timeoutMs };
    case StopReason.Aborted:
      return { kind: "aborted", message: SuperviseMessage.Aborted };
    case StopReason.OutputTooLarge:
      return {
        kind: "output-too-large",
        message: SuperviseMessage.OutputTooLarge,
        limitBytes: limits.maxStdoutBytes,
        actualBytes: stdoutBytes,
      };
  }
}

export function exitFailure(exit: ProcessExit, stderrTail: string): RunFailure {
  return { kind: "exit", message: EngineMessage.Exit, code: exit.code, signal: exit.signal, stderrTail };
}

export function isFailedExit(exit: ProcessExit): boolean {
  return (exit.code !== null && exit.code !== ExitCode.Success) || exit.signal !== null;
}
