import { readFileSync } from "node:fs";
import { join } from "node:path";
import { str, obj } from "../core/rows.ts";
import { ClaudeDir, ClaudeFile } from "./constants.ts";
import { claudeHome } from "./locate.ts";

export function claudeSessionIdOfPid(pid: number, home: string = claudeHome()): string | null {
  try {
    const decoded: unknown = JSON.parse(readFileSync(join(home, ClaudeDir.Sessions, `${pid}${ClaudeFile.Session}`), "utf8"));
    return str(obj(decoded)["sessionId"]);
  } catch {
    return null;
  }
}
