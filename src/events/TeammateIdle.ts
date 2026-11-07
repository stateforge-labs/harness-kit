import type { EventHandler } from "./types.ts";

// TeammateIdle supports the http hook type. Passive: it never blocks or stops a teammate.
export const handler: EventHandler = {
  event: "TeammateIdle",
  required: ["teammate_name", "team_name"],
  meta: (p) => ({
    teammate_name: typeof p.teammate_name === "string" ? p.teammate_name : null,
    team_name: typeof p.team_name === "string" ? p.team_name : null,
  }),
  respond: () => ({}),
};
