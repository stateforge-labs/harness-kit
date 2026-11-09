export const EvidenceKind = { Capture: "capture", Doc: "doc", Probe: "probe", Shipped: "shipped" } as const;
export type EvidenceKind = (typeof EvidenceKind)[keyof typeof EvidenceKind];

export const MeasuredState = { Measured: "measured", Unmeasured: "unmeasured" } as const;
export type MeasuredState = (typeof MeasuredState)[keyof typeof MeasuredState];

export interface EvidenceRef {
  readonly kind: EvidenceKind;
  readonly ref: string;
  readonly harnessVersion: string | null;
  readonly capturedAt: string;
}

/** A fact that carries its evidence, or the question that is still open. */
export type Measured<T> =
  | { readonly state: "measured"; readonly value: T; readonly evidence: EvidenceRef }
  | { readonly state: "unmeasured"; readonly question: string };

export type Suggested<T> = { readonly value: T; readonly evidence: EvidenceRef; readonly applied: false };

export function measured<T>(value: T, evidence: EvidenceRef): Measured<T> {
  return { state: MeasuredState.Measured, value, evidence };
}

export function unmeasured(question: string): Measured<never> {
  return { state: MeasuredState.Unmeasured, question };
}
