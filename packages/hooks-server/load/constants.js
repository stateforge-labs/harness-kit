export const HOOK_PATH = "/hook/claude";
export const FIXTURE_DIR = "../../hooks/fixtures/claude";
export const PRE_FIXTURE = `${FIXTURE_DIR}/PreToolUse/01-write.json`;
export const POST_FIXTURE = `${FIXTURE_DIR}/PostToolUse/01-write.json`;

export const Scenario = { Small: "agents10", Large: "agents50" };

export const P95_BUDGET_MS = 25;

export const CHECK_STATUS = "status is 200";
export const CHECK_OBJECT = "body is a JSON object";
export const TAG_EVENT = "event";
export const EVENT_PRE = "PreToolUse";
export const EVENT_POST = "PostToolUse";

export const MS_PER_SECOND = 1000;
export const HTTP_OK = 200;
export const SESSION_PREFIX = "k6-session";
export const TOOL_USE_PREFIX = "toolu_k6";
