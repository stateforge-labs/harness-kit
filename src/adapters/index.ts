import type { HarnessAdapter } from "../port.ts";
import { claude } from "./claude/adapter.ts";

/** Every harness the server speaks. Keyed in a Map so a prototype key such as "constructor" can never resolve to an adapter. */
export const adapters: ReadonlyMap<string, HarnessAdapter> = new Map<string, HarnessAdapter>([[claude.id, claude]]);
