import { readdirSync } from "node:fs";

export function descend(depth) {
  if (depth === 0) return readdirSync(".");
  return descend(depth - 1);
}
