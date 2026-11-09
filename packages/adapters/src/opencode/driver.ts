import { Harness } from "@stateforge-labs/harness-hooks";
import { Engine } from "../core/capability.ts";
import { CredentialMode } from "../core/credential-plan.ts";
import { deepFreeze } from "../core/profile.ts";
import type { HarnessDriver } from "../driver/port.ts";
import { OPENCODE_CAPABILITIES } from "./capabilities.ts";
import { credentialFromOpencode, openCodeCredentialPlan } from "./credentials.ts";
import { opencodeCli } from "./engines/cli.ts";
import { inspectOpencode } from "./inspect.ts";
import { OPENCODE_PROFILE } from "./profile.ts";

export const OPENCODE_DRIVER: HarnessDriver<"opencode"> = deepFreeze({
  id: Harness.OpenCode,
  profile: OPENCODE_PROFILE,
  capabilities: OPENCODE_CAPABILITIES,
  credentials: {
    modes: [CredentialMode.ApiKey, CredentialMode.LoginStore],
    from: credentialFromOpencode,
    plan: openCodeCredentialPlan,
    policyNotice: () => null,
    inspect: inspectOpencode,
  },
  run: { engines: [Engine.Cli], cli: opencodeCli },
});
