import type { Secret } from "./secret.ts";

export interface CredentialSpec {
  readonly mode: string;
  readonly key?: Secret;
  readonly token?: Secret;
  readonly provider?: string;
  readonly selector?: string;
  readonly acknowledgePolicy?: boolean;
}

export type CredentialOf<I extends string> = CredentialSpec;

export interface PolicyQuote {
  readonly text: string;
  readonly source: string;
}

export interface PolicyNotice {
  readonly harness: "claude";
  readonly mode: "login-store" | "token";
  readonly quotes: readonly PolicyQuote[];
  readonly retrievedAt: string;
}

export interface CredentialEvidence {
  readonly requested: string;
  readonly observed: string | null;
  readonly verified: boolean;
  readonly scrubbed: readonly string[];
  readonly billing: "per-token" | "subscription" | "unverified";
  readonly acknowledgement: { readonly noticeRetrievedAt: string } | null;
}
