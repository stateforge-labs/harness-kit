import type { Middleware } from "@homelab/harness-hooks";
const v1Everything: Middleware = async () => ({
  context: "V1-CONTEXT",
  deny: { reason: "V1-DENY-REASON" },
  continue: { reason: "V1-CONTINUE-REASON" },
  allow: true,
});
export default v1Everything;
