export interface NeutralReply {
  context?: string;
  deny?: Deny;
  continue?: Continue;
  allow?: true;
  worktree?: WorktreePath;
}

export interface WorktreePath {
  path: string;
}

export interface Deny {
  reason: string;
  hint?: string;
}

export interface Continue {
  reason: string;
  missing?: string[];
}

export const denyText = (d: Deny): string => (d.hint ? `${d.reason}\n${d.hint}` : d.reason);

export const continueText = (c: Continue): string =>
  c.missing?.length ? `${c.reason}\n${c.missing.map((m) => `- ${m}`).join("\n")}` : c.reason;
