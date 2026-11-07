// session.compaction: R-2026-11-07-08, opencode 2.2.6 (envelope only, see below)
import { z } from "zod";
import { common } from "../common.ts";

export const event = "session.compaction";

export const schema = z.looseObject({
  ...common,
  // UNRESOLVED: this hook was registered but never fired in a capture; only the envelope is typed
});
