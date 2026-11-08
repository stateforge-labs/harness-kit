import type { Middleware } from "@stateforge-labs/harness-hooks";
const v1Continue: Middleware = async () => ({ continue: { reason: "V1-CONTINUE-REASON", missing: ["V1-MISSING-1", "V1-MISSING-2"] } });
export default v1Continue;
