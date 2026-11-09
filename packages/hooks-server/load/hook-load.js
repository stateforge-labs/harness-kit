import http from "k6/http";
import { check, sleep } from "k6";
import { env } from "./env.js";
import {
  CHECK_OBJECT,
  CHECK_STATUS,
  EVENT_POST,
  EVENT_PRE,
  HOOK_PATH,
  HTTP_OK,
  MS_PER_SECOND,
  P95_BUDGET_MS,
  POST_FIXTURE,
  PRE_FIXTURE,
  SESSION_PREFIX,
  Scenario,
  TAG_EVENT,
  TOOL_USE_PREFIX,
} from "./constants.js";

const pre = JSON.parse(open(PRE_FIXTURE));
const post = JSON.parse(open(POST_FIXTURE));

const headers = { "Content-Type": "application/json" };
if (env.token !== "") headers.Authorization = `Bearer ${env.token}`;

const url = `${env.baseUrl}${HOOK_PATH}`;
const budgetMs = env.p95BudgetMs > 0 ? env.p95BudgetMs : P95_BUDGET_MS;

const agents = (vus, startTime) => ({
  executor: "constant-vus",
  vus,
  duration: env.duration,
  startTime,
});

const scenarios = {
  [Scenario.Small]: agents(env.vusSmall, "0s"),
  [Scenario.Large]: agents(env.vusLarge, "0s"),
};

const selected = () => {
  if (!(env.scenario in scenarios)) throw new Error(`unknown SCENARIO ${env.scenario}`);
  return { [env.scenario]: scenarios[env.scenario] };
};

export const options = {
  scenarios: selected(),
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
    http_req_duration: [`p(95)<${budgetMs}`],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const send = (payload, event, sessionId, toolUseId) => {
  const body = JSON.stringify({ ...payload, session_id: sessionId, tool_use_id: toolUseId });
  const res = http.post(url, body, { headers, tags: { [TAG_EVENT]: event } });
  check(res, {
    [CHECK_STATUS]: (r) => r.status === HTTP_OK,
    [CHECK_OBJECT]: (r) => {
      try {
        const parsed = r.json();
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
      } catch (_) {
        return false;
      }
    },
  });
};

export default function () {
  const sessionId = `${SESSION_PREFIX}-${__VU}`;
  const toolUseId = `${TOOL_USE_PREFIX}-${__VU}-${__ITER}`;
  send(pre, EVENT_PRE, sessionId, toolUseId);
  sleep(env.thinkMs / MS_PER_SECOND);
  send(post, EVENT_POST, sessionId, toolUseId);
  sleep(env.thinkMs / MS_PER_SECOND);
}
