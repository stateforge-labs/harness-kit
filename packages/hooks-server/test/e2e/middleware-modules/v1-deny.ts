import type { Middleware } from "@stateforge-labs/harness-hooks";
const v1Deny: Middleware = async () => ({ deny: { reason: "V1-DENY-REASON", hint: "V1-DENY-HINT" } });
export default v1Deny;
