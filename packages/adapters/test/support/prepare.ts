import type { CredentialSpec } from "../../src/core/credential.ts";
import { prepare } from "../../src/driver/options.ts";
import { type HeadlessOptions, type RunRequest } from "../../src/core/run.ts";
import { secret } from "../../src/core/secret.ts";
import { fakeDriver, FAKE_STRIP } from "./fake-driver.ts";
import { ambientEnv, SENTINEL } from "./credential.ts";

export const CRED: CredentialSpec = { mode: "api-key", key: secret(SENTINEL) };
export const BASE = ambientEnv([FAKE_STRIP], "/h/u");

export function options(extra: Partial<HeadlessOptions<"fake">> = {}): HeadlessOptions<"fake"> {
  return { credential: CRED, ...extra };
}

export function request(extra: Partial<RunRequest> = {}): RunRequest {
  return { instructions: "be brief", input: "hello", ...extra };
}

export function prep(opts: Partial<HeadlessOptions<"fake">> = {}, req: Partial<RunRequest> = {}, base: Record<string, string> = BASE) {
  return prepare({ driver: fakeDriver(), options: options(opts), request: request(req), base, cwd: "/work" });
}
