export const env = {
  baseUrl: __ENV.HOOK_URL || "http://127.0.0.1:8787",
  token: __ENV.HOOK_TOKEN || "",
  scenario: __ENV.SCENARIO || "agents10",
  vusSmall: Number(__ENV.VUS_SMALL || 10),
  vusLarge: Number(__ENV.VUS_LARGE || 50),
  duration: __ENV.DURATION || "30s",
  thinkMs: Number(__ENV.THINK_MS || 100),
  p95BudgetMs: Number(__ENV.P95_BUDGET_MS || 0),
};
