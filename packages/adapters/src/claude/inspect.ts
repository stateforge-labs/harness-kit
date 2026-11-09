import { Dir } from "../constants.ts";
import { EnvVar } from "../env.ts";
import { type InspectIo, inspectStore } from "../core/inspect.ts";
import { CLAUDE_CREDENTIAL_VARS } from "./credentials.ts";
import { ClaudeAuthFile } from "./constants.ts";

export function inspectClaude(io: InspectIo) {
  return inspectStore(
    {
      homeVar: EnvVar.ClaudeConfigDir,
      defaultSubdir: [Dir.Claude],
      storeFile: [ClaudeAuthFile.Credentials],
      ambientNames: CLAUDE_CREDENTIAL_VARS,
      keyringCheck: null,
    },
    io,
  );
}
