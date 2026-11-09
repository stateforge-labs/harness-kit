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
  EnvTooLarge: "the argument vector and environment exceed the platform budget",
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

export const PlanNote = {
  ArgvExposure: "argv-readable-by-same-user",
  ClaudeSettingsMayOverride: "claude-user-settings-may-override-credentials",
  ClaudeApiKeyHelperUnmeasured: "claude-apikeyhelper-interaction-unmeasured",
  OpencodeInjectionUnmeasured: "opencode-credential-injection-unmeasured",
  EnvBytesNotCounted: "environment-bytes-counted-at-run-only",
  IsolationHeadlessUnmeasured: "isolation-headless-unmeasured",
} as const;

export const Layer = {
  Fact: "fact",
  Consumer: "consumer",
  Call: "call",
} as const;
export type Layer = (typeof Layer)[keyof typeof Layer];

export const ConfigField = {
  TimeoutMs: "timeoutMs",
  MaxArgvBytes: "maxArgvBytes",
  Model: "model",
  Input: "input",
  Instructions: "instructions",
  Credential: "credential",
  Engine: "engine",
  Cwd: "cwd",
  Effort: "effort",
  Limits: "limits",
} as const;

export const ConfigMessage = {
  Positive: "must be a positive integer",
  Text: "must be a string",
  NonEmpty: "must be a non-empty string",
  Required: "is required",
  CliOnly: "must be the cli engine",
} as const;

export const EnvField = {
  Environment: "environment",
} as const;

export const DEFAULT_PERSIST = true;
export const NO_HOME_VAR = "";

export const StopReason = {
  Timeout: "timeout",
  Aborted: "aborted",
  OutputTooLarge: "output-too-large",
} as const;
export type StopReason = (typeof StopReason)[keyof typeof StopReason];

export const SuperviseMessage = {
  Aborted: "the run was aborted",
  Timeout: "the run exceeded its timeout",
  OutputTooLarge: "the harness wrote more stdout than the limit allows",
  BinaryMissing: "the harness binary was not found",
  SpawnFailed: "the harness could not be started",
} as const;

export const DrainStep = {
  Expired: "expired",
} as const;

export const AbortEvent = {
  Abort: "abort",
} as const;

export const Decode = {
  Streaming: { stream: true },
} as const;

export const ExitCode = {
  Success: 0,
} as const;

export const ExecuteText = {
  Failed: " failed: ",
  UnknownName: "Error",
} as const;
