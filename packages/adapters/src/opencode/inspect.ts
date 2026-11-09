import { Dir } from "../constants.ts";
import { EnvVar } from "../env.ts";
import { type InspectIo, inspectStore } from "../core/inspect.ts";
import { OPENCODE_CREDENTIAL_VARS } from "./credentials.ts";
import { OpenCodeAuthFile, OpenCodeDir } from "./constants.ts";

export function inspectOpencode(io: InspectIo) {
  return inspectStore(
    {
      homeVar: EnvVar.XdgDataHome,
      defaultSubdir: Dir.LocalShare,
      storeFile: [OpenCodeDir.Data, OpenCodeAuthFile.Auth],
      ambientNames: OPENCODE_CREDENTIAL_VARS,
      keyringCheck: null,
    },
    io,
  );
}
