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
