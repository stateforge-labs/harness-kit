import { CLAUDE_POLICY_RETRIEVED_AT } from "../packages/adapters/src/claude/policy-notice.ts";
import { noticeIsFresh } from "./lib/notice-fresh.ts";

const NOW_FLAG = "--now";

export function nowFromArgv(argv: readonly string[]): number | null {
  const index = argv.indexOf(NOW_FLAG);
  if (index < 0) {
    return Date.now();
  }
  const value = argv[index + 1];
  if (value === undefined) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

if (import.meta.main) {
  const nowMs = nowFromArgv(process.argv.slice(2));
  if (nowMs === null) {
    console.error(`usage: bun tools/check-policy-notice.ts [${NOW_FLAG} <iso>]`);
    process.exit(2);
  }
  if (!noticeIsFresh(CLAUDE_POLICY_RETRIEVED_AT, nowMs)) {
    console.error(`claude policy notice retrieved ${CLAUDE_POLICY_RETRIEVED_AT} is older than 30 days: re-read the code.claude.com pages and update ClaudePolicy`);
    process.exit(1);
  }
  console.log(`claude policy notice retrieved ${CLAUDE_POLICY_RETRIEVED_AT} is fresh`);
}
