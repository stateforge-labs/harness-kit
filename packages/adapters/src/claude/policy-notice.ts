import { CredentialMode } from "../core/credential-plan.ts";
import type { PolicyNotice } from "../core/credential.ts";
import { ClaudePolicy } from "./constants.ts";

export const CLAUDE_POLICY_RETRIEVED_AT: string = ClaudePolicy.RetrievedAt;

export function isGatedClaudeMode(mode: string): mode is PolicyNotice["mode"] {
  return mode === CredentialMode.LoginStore || mode === CredentialMode.Token;
}

export function claudePolicyNotice(mode: string): PolicyNotice | null {
  if (!isGatedClaudeMode(mode)) {
    return null;
  }
  return { harness: "claude", mode, quotes: ClaudePolicy.Quotes, retrievedAt: CLAUDE_POLICY_RETRIEVED_AT };
}
