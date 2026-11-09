import type { Secret } from "./secret.ts";

export type ClaudeCredential =
  | { readonly mode: "api-key"; readonly key: Secret }
  | { readonly mode: "login-store"; readonly acknowledgePolicy: true }
  | { readonly mode: "token"; readonly token: Secret; readonly acknowledgePolicy: true }
  | { readonly mode: "cloud"; readonly selector: string };

export type CodexCredential = { readonly mode: "api-key"; readonly key: Secret } | { readonly mode: "login-store" };

export type OpenCodeCredential =
  | { readonly mode: "api-key"; readonly key: Secret; readonly provider: string }
  | { readonly mode: "login-store"; readonly provider?: string };

export interface CredentialByHarness {
  readonly claude: ClaudeCredential;
  readonly codex: CodexCredential;
  readonly opencode: OpenCodeCredential;
}

export interface CredentialSpec {
  readonly mode: string;
  readonly key?: Secret;
  readonly token?: Secret;
  readonly provider?: string;
  readonly selector?: string;
  readonly acknowledgePolicy?: boolean;
}

export type CredentialOf<I extends string> = I extends keyof CredentialByHarness ? CredentialByHarness[I] : CredentialSpec;

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
