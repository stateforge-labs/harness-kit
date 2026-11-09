import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "bun:test";
import { CapabilityName } from "../../src/core/capability.ts";
import { EvidenceKind, MeasuredState, type EvidenceRef } from "../../src/core/evidence.ts";

export const adaptersRoot = join(import.meta.dir, "..", "..");

export interface EvidenceTally {
  measured: number;
  unmeasured: number;
  suggested: number;
}

const EVIDENCE_KINDS: readonly string[] = Object.values(EvidenceKind);

function checkEvidence(evidence: EvidenceRef, at: string): void {
  expect(EVIDENCE_KINDS).toContain(evidence.kind);
  expect(evidence.ref.length).toBeGreaterThan(0);
  expect(evidence.capturedAt.length).toBeGreaterThan(0);
  if (evidence.kind === EvidenceKind.Capture) {
    expect({ at, exists: existsSync(join(adaptersRoot, evidence.ref)) }).toEqual({ at, exists: true });
  }
}

export function walkEvidence(value: unknown, at = "profile", tally: EvidenceTally = { measured: 0, unmeasured: 0, suggested: 0 }): EvidenceTally {
  if (typeof value !== "object" || value === null) {
    return tally;
  }
  const record = value as Record<string, unknown>;
  if (record["state"] === MeasuredState.Measured) {
    tally.measured += 1;
    checkEvidence(record["evidence"] as EvidenceRef, at);
  } else if (record["state"] === MeasuredState.Unmeasured) {
    tally.unmeasured += 1;
    expect(String(record["question"]).endsWith("?")).toBe(true);
  } else if (record["applied"] === false) {
    tally.suggested += 1;
    checkEvidence(record["evidence"] as EvidenceRef, at);
  }
  for (const [key, member] of Object.entries(record)) {
    walkEvidence(member, `${at}.${key}`, tally);
  }
  return tally;
}

export function readFixture(path: string): string {
  return readFileSync(join(adaptersRoot, path), "utf8");
}

export function flagAppearsIn(flag: string, help: string): boolean {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[\\s,])${escaped}(?=[\\s,=<]|$)`, "mu").test(help);
}

export const CAPABILITY_NAMES: readonly string[] = Object.values(CapabilityName);
