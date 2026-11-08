// Contract v1: denies every event (adapters encode it only where a deny means something).
import type { Middleware } from "@homelab/harness-hooks";
const v1Deny: Middleware = async () => ({ deny: { reason: "V1-DENY-REASON", hint: "V1-DENY-HINT" } });
export default v1Deny;
