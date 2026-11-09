import { createRuntime, Harness, secret } from "../src/runtime/index.ts";

export async function apiKeyCredential(key: string) {
  await using runtime = createRuntime({ allowedModes: ["api-key"] });
  const notice = runtime.policyNotice(Harness.Claude, "login-store");
  const credential = runtime.credentialFrom(Harness.Claude, {
    mode: "api-key",
    key: secret(key),
    baseUrl: "https://gateway.example.test",
  });
  return { notice, credential };
}
