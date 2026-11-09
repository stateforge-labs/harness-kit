import { Harness } from "@stateforge-labs/harness-hooks";
import { Engine } from "../core/capability.ts";
import { CredentialMode } from "../core/credential-plan.ts";
import { deepFreeze } from "../core/profile.ts";
import type { HarnessDriver } from "../driver/port.ts";
import { CODEX_CAPABILITIES } from "./capabilities.ts";
import { codexCredentialPlan, credentialFromCodex } from "./credentials.ts";
import { codexCli } from "./engines/cli.ts";
import { inspectCodex } from "./inspect.ts";
import { CODEX_PROFILE } from "./profile.ts";

export const CODEX_DRIVER: HarnessDriver<"codex"> = deepFreeze({
  id: Harness.Codex,
  profile: CODEX_PROFILE,
  capabilities: CODEX_CAPABILITIES,
  credentials: {
    modes: [CredentialMode.ApiKey, CredentialMode.LoginStore],
    from: credentialFromCodex,
    plan: codexCredentialPlan,
    policyNotice: () => null,
    inspect: inspectCodex,
  },
  run: { engines: [Engine.Cli], cli: codexCli },
});
