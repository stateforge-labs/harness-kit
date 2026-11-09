import { readFileSync } from "node:fs";
import { CodexCli } from "./constants.ts";
import { CodexFeature } from "./enums.ts";

export const CODEX_BINARY = CodexCli.Binary;

export const CODEX_UNUSED_FEATURES: readonly CodexFeature[] = CodexFeature.options;

export interface CodexExecOptions {
  readonly model: string;
  readonly effort?: string | null;
  readonly outFile: string;
  readonly disableFeatures?: readonly string[];
}

export interface CodexInvocation {
  readonly program: string;
  readonly args: string[];
}

const VERSION = /\d+\.\d+\.\d+\S*/u;

export function codexExec(opts: CodexExecOptions): CodexInvocation {
  const features = opts.disableFeatures ?? CODEX_UNUSED_FEATURES;
  return {
    program: CODEX_BINARY,
    args: [
      CodexCli.Exec,
      CodexCli.Ephemeral,
      CodexCli.SkipGitRepoCheck,
      CodexCli.IgnoreUserConfig,
      CodexCli.Sandbox,
      CodexCli.ReadOnly,
      CodexCli.Color,
      CodexCli.ColorNever,
      ...(opts.model === "" ? [] : [CodexCli.Model, opts.model]),
      ...(opts.effort ? [CodexCli.Config, `${CodexCli.ReasoningEffortKey}=${opts.effort}`] : []),
      ...features.flatMap((feature) => [CodexCli.Disable, feature]),
      CodexCli.Output,
      opts.outFile,
      CodexCli.Stdin,
    ],
  };
}

export function codexVersionArgs(): string[] {
  return [CodexCli.Version];
}

export function parseCodexVersion(stdout: string): string | null {
  return VERSION.exec(stdout)?.[0] ?? null;
}

export function readLastMessage(outFile: string): string | null {
  try {
    const text = readFileSync(outFile, "utf8");
    return text.trim() === "" ? null : text;
  } catch {
    return null;
  }
}
