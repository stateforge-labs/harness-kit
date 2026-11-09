import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CurlTokenSource, EnvVar, curlSupports, parseCurlVersion, processEnv } from "@stateforge-labs/harness-hooks";

export const REAL_CURL = Bun.which("curl");

export const REAL_CURL_VERSION: string | undefined = REAL_CURL ? parseCurlVersion(new TextDecoder().decode(Bun.spawnSync([REAL_CURL, "--version"]).stdout)) : undefined;

export const realCurlHas = (source: (typeof CurlTokenSource)[keyof typeof CurlTokenSource]): boolean => REAL_CURL_VERSION !== undefined && curlSupports(REAL_CURL_VERSION, source);

const TOKEN_FLAGS = ["--variable", "--expand-header"];

export interface FakeCurl {
  version: string;
  rejectTokenFlags?: boolean;
}

export async function fakeCurlDir(root: string, fake: FakeCurl): Promise<string> {
  if (!REAL_CURL) throw new Error("curl is not on PATH");
  const dir = await mkdtemp(join(root, "fakecurl-"));
  const lines = [
    "#!/bin/sh",
    `if [ "$1" = --version ]; then printf 'curl %s (fake)\\n' '${fake.version}'; exit 0; fi`,
    ...(fake.rejectTokenFlags ? [`for a in "$@"; do case "$a" in ${TOKEN_FLAGS.join("|")}) exit 2 ;; esac; done`] : []),
    `exec '${REAL_CURL}' "$@"`,
    "",
  ];
  await writeFile(join(dir, "curl"), lines.join("\n"));
  await chmod(join(dir, "curl"), 0o755);
  return dir;
}

export async function pathWith(root: string, fake: FakeCurl): Promise<Record<string, string>> {
  return { [EnvVar.Path]: `${await fakeCurlDir(root, fake)}:${processEnv()[EnvVar.Path] ?? ""}` };
}
