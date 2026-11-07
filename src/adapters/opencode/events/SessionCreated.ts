// session.created: R-2026-11-07-08, opencode 2.2.6
import { z } from "zod";
import { common } from "../common.ts";

export const event = "session.created";

export const schema = z.looseObject({
  ...common,
  agent: z.string(),
  projectID: z.string(),
  /** Present when the session was started by another (a subagent's child session). */
  parentID: z.string().optional(),
  slug: z.string(),
  subpath: z.string(),
  title: z.string(),
  version: z.string(),
  location: z.looseObject({ directory: z.string() }),
  model: z.looseObject({ id: z.string(), providerID: z.string(), variant: z.string().optional() }),
});
