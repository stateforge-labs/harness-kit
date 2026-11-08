import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  agent: z.string(),
  projectID: z.string(),
  parentID: z.string().optional(),
  slug: z.string(),
  subpath: z.string(),
  title: z.string(),
  version: z.string(),
  location: z.looseObject({ directory: z.string() }),
  model: z.looseObject({ id: z.string(), providerID: z.string(), variant: z.string().optional() }),
});
