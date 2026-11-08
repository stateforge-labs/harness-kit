// Contract v1: asks every event to continue (adapters encode it only on stop events).
import type { Middleware } from "@homelab/harness-hooks";
const v1Continue: Middleware = async () => ({ continue: { reason: "V1-CONTINUE-REASON", missing: ["V1-MISSING-1", "V1-MISSING-2"] } });
export default v1Continue;
