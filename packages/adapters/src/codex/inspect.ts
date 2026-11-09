import { Dir } from "../constants.ts";
import { EnvVar } from "../env.ts";
import { type InspectIo, inspectStore } from "../core/inspect.ts";
import { CODEX_CREDENTIAL_VARS } from "./credentials.ts";
import { CodexAuthFile, CodexKeyringSetting } from "./constants.ts";

export function inspectCodex(io: InspectIo) {
  return inspectStore(
    {
      homeVar: EnvVar.CodexHome,
      defaultSubdir: [Dir.Codex],
      storeFile: [CodexAuthFile.Auth],
      ambientNames: CODEX_CREDENTIAL_VARS,
      keyringCheck: { file: [CodexAuthFile.Config], pattern: CodexKeyringSetting.Pattern },
    },
    io,
  );
}
