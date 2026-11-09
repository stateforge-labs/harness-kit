import type { Limits } from "../core/run.ts";

export const FAILURE_TAIL_BYTES = 4096;

export const EngineReason = {
  NotJson: "not-json",
  NoResult: "no-result",
  EmptyLastMessage: "empty-last-message",
  EmptyText: "empty-text",
} as const;

export const EngineMessage = {
  Unsupported: "the run needs a capability this engine cannot use",
  EffortUnmeasured: "effort.accepted is unmeasured for this harness",
  EffortRejected: "the effort value is not in the measured accepted list",
  StandaloneMissing: "this opencode build does not offer --standalone",
  ArgvTooLarge: "the argument vector exceeds the platform budget",
  ArgTooLarge: "one argument exceeds the platform per-argument limit",
  Exit: "the harness exited with a failure",
  Unparsable: "the harness output could not be read",
} as const;

export const EngineCapability = {
  Standalone: "standalone",
} as const;

export const EffortName = {
  HarnessDefault: "harness-default",
} as const;

export const ArgvField = {
  Instructions: "instructions",
} as const;

export const ArgvCarry = {
  Instructions: "instructions",
  Input: "input",
} as const;

export const CostBasis = {
  List: "list",
  Unreported: "unreported",
  Unavailable: "unavailable",
} as const;

export const PromptText = {
  Empty: "",
  Separator: "\n\n",
  Line: "\n",
} as const;

export const KILL_GRACE_MS = 5_000;
export const PROCESS_DRAIN_GRACE_MS = 1_000;
export const DRAIN_GRACE_MS = 1_000;
export const VERSION_PROBE_MS = 10_000;
export const STDERR_TAIL_BYTES = 4096;
export const VERSION_OUTPUT_BYTES = 4096;
export const ISOLATION_PREFIX = "stateforge-adapters-run-";
export const SCRATCH_PREFIX = "stateforge-adapters-scratch-";
export const PLACEHOLDER_OUT_FILE = "{out-file}";
export const TMP_FALLBACK = "/tmp";
export const DIR_MODE = 0o700;

export const DEFAULT_LIMITS: Limits = {
  maxStdoutBytes: 8_388_608,
  maxStderrBytes: 65_536,
};

export const Signal = {
  Term: "SIGTERM",
  Kill: "SIGKILL",
} as const;
export type Signal = (typeof Signal)[keyof typeof Signal];

export const SpawnCode = {
  NotFound: "not-found",
  SpawnFailed: "spawn-failed",
  ArgvTooBig: "argv-too-big",
} as const;
export type SpawnCode = (typeof SpawnCode)[keyof typeof SpawnCode];

export const SystemCode = {
  NoEntry: "ENOENT",
  TooBig: "E2BIG",
  NoProcess: "ESRCH",
} as const;

export const ProcessEvent = {
  Spawn: "spawn",
  Error: "error",
  Exit: "exit",
  Close: "close",
} as const;

export const Stdio = {
  Pipe: "pipe",
} as const;

export const Platform = {
  Linux: "linux",
} as const;

export const Encoding = {
  Utf8: "utf8",
} as const;

export const OpenFlag = {
  Read: "r",
} as const;
export type OpenFlag = (typeof OpenFlag)[keyof typeof OpenFlag];
