import { Buffer } from "node:buffer";
import { EvidenceKind, type EvidenceRef } from "./evidence.ts";

export const LINUX_MAX_ARGV_BYTES = 2_097_152;
export const LINUX_MAX_ARG_BYTES = 131_071;

export const LINUX_ARGV_EVIDENCE: EvidenceRef = {
  kind: EvidenceKind.Probe,
  ref: "probe of the Linux execve argument limits",
  harnessVersion: null,
  capturedAt: "2026-11-09",
};

const ARG_TERMINATOR_BYTES = 1;
const ENV_SEPARATOR_BYTES = 2;

export function argvBytes(args: readonly string[]): number {
  return args.reduce((total, arg) => total + Buffer.byteLength(arg) + ARG_TERMINATOR_BYTES, 0);
}

export function longestArgBytes(args: readonly string[]): number {
  return args.reduce((longest, arg) => Math.max(longest, Buffer.byteLength(arg)), 0);
}

export function envBytes(env: Readonly<Record<string, string>>): number {
  return Object.entries(env).reduce(
    (total, [key, value]) => total + Buffer.byteLength(key) + Buffer.byteLength(value) + ENV_SEPARATOR_BYTES,
    0,
  );
}
