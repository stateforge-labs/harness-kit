import type { PolicyNotice } from "../core/credential.ts";

export function claudePolicyNotice(mode: PolicyNotice["mode"]): PolicyNotice {
  return { harness: "claude", mode, quotes: [], retrievedAt: "" };
}
