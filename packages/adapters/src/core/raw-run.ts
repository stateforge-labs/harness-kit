import type { Effort, Hermetic, IsolationSpec } from "./run.ts";

export interface ResolvedOptions {
  readonly model: string | null;
  readonly effort: Effort | null;
  readonly hermetic: Hermetic;
  readonly persist: boolean;
  readonly maxArgvBytes: number | null;
  readonly cwd: string;
  readonly isolation: IsolationSpec;
}

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: string | null;
}
