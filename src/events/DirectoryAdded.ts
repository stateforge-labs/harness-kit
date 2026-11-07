// DirectoryAdded: http supported. Passive: no context injection, no blocking (the add has already completed). Returns {}.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "DirectoryAdded",
  // How the directory was added only. The directory path itself is not logged.
  meta: (p) => ({ source: str(p.source) }),
  respond: () => ({}),
};
