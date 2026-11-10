import { claudeHookCallbacks } from "../agent/hooks/index.ts";
import { Harness } from "@stateforge-labs/harness-hooks";
import { CredentialMode } from "../core/credential-plan.ts";
import { Engine } from "../core/capability.ts";
import { deepFreeze } from "../core/profile.ts";
import type { HarnessDriver } from "../driver/port.ts";
import { CLAUDE_CAPABILITIES } from "./capabilities.ts";
import { claudeCredentialPlan, credentialFromClaude } from "./credentials.ts";
import { claudeCli } from "./engines/cli.ts";
import { claudeSdkEngine } from "./engines/sdk.ts";
import { inspectClaude } from "./inspect.ts";
import { claudePolicyNotice } from "./policy-notice.ts";
import { CLAUDE_PROFILE } from "./profile.ts";

export const CLAUDE_DRIVER: HarnessDriver<"claude"> = deepFreeze({
  id: Harness.Claude,
  profile: CLAUDE_PROFILE,
  capabilities: CLAUDE_CAPABILITIES,
  credentials: {
    modes: [CredentialMode.ApiKey, CredentialMode.LoginStore, CredentialMode.Token, CredentialMode.Cloud],
    from: credentialFromClaude,
    plan: claudeCredentialPlan,
    policyNotice: claudePolicyNotice,
    inspect: inspectClaude,
  },
  run: { engines: [Engine.Cli], cli: claudeCli, agent: claudeSdkEngine({ hooks: claudeHookCallbacks }) },
});
