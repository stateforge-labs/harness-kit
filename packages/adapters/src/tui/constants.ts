export const TuiBox = {
  Claude: /^[\s\-_=─━═│┃┌┐└┘├┤┬┴┼╭╮╰╯▔▁|+]*$/u,
  OpenCode: /^[\s\-_=─━═│┃┌┐└┘├┤┬┴┼╭╮╰╯▔▁|+▀▄█╹╻]*$/u,
} as const;

export const TuiLine = {
  Interrupt: /esc to interrupt/i,
  CycleMode: /shift\+tab to cycle/i,
  Shortcuts: /\? for shortcuts/i,
  Status: /^\s*⏵⏵/u,
  Permissions: /(?:bypass permissions|auto-accept|auto mode) (?:on|off)/i,
  CtrlHint: /\(ctrl\+[a-z] to [a-z ]+\)/i,
  Spinner: /^\s*[✻✽✶✳✢·*] .*… \(\d+s/u,
  EmptyPrompt: /^\s*[❯›>]\s*$/u,
  CodexHeader: /^\s*>_ OpenAI Codex \(v\d+\.\d+\.\d+\)/u,
  CodexWelcome: /^\s*To get started, describe a task or try one of these commands:/u,
  CodexPlaceholder: /^\s*› Ask Codex to do anything\s*$/u,
  CodexAgents: /← for agents/u,
  CodexModelFooter: /^\s*[^·]+ · ~\//u,
  CodexWarnings: /⚠ \d+ warnings? · f2 to view/u,
  OpenCodePlaceholder: /Ask anything…/u,
  OpenCodeMode: /┃\s+Build · /u,
  OpenCodeKeys: /shift\+tab agents\s+ctrl\+p commands/u,
  OpenCodeVersion: /^ {40,}\d+\.\d+\.\d+\s*$/u,
} as const;
