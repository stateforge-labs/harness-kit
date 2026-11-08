// Contract v1 encoding (ADR 0001 "What each reply field becomes"), through the real server over HTTP for claude, codex and opencode.
// Each cell of the matrix is one test: a server started with one v1-* middleware module answers a real fixture, and the body is compared
// exactly. Nothing here is in-process, because the encoding is the last step before the wire, which only the server reaches.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { startServer, type RunningServer } from "./harness.ts";
import { fixture, variant } from "./kit.ts";

const mod = (name: string) => join(import.meta.dir, "middleware-modules", `${name}.ts`);
const S: Record<string, RunningServer> = {};

beforeAll(async () => {
  const names = ["v1-everything", "v1-deny", "v1-allow", "v1-continue", "v1-clears"];
  const started = await Promise.all([
    ...names.map((n) => startServer({ HOOK_MIDDLEWARE: mod(n) })),
    startServer({ HOOK_MIDDLEWARE: [mod("v1-clears"), mod("v1-deny")].join(",") }),
    // No middleware: the built-in policy alone. Its own session-start context is the baseline a non-context layer must not change.
    startServer({}),
  ]);
  names.forEach((n, i) => (S[n] = started[i]!));
  S.layered = started[names.length]!;
  S.baseline = started[names.length + 1]!;
}, 30_000);
afterAll(() => Promise.all(Object.values(S).map((s) => s.stop())));

/** Posts one real fixture of the event to the server and returns the status (must be 200) and the parsed body. */
async function answer(srv: RunningServer, harness: string, event: string): Promise<unknown> {
  const res = await fetch(`${srv.base}/hook/${harness}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(variant(fixture(harness, event))),
  });
  expect(res.status).toBe(200);
  return res.json();
}

const DENY_EVERYTHING = "V1-DENY-REASON";
const DENY_WITH_HINT = "V1-DENY-REASON\nV1-DENY-HINT";
const CONTINUE_ONE = "V1-CONTINUE-REASON";
const CONTINUE_MISSING = "V1-CONTINUE-REASON\n- V1-MISSING-1\n- V1-MISSING-2";

for (const harness of ["claude", "codex"] as const) {
  describe(`e2e: contract v1 encoding, ${harness}`, () => {
    // pre-tool: deny is permissionDecision, context is additionalContext, allow and continue are not encoded
    test("PreToolUse: deny wins over context (v1-everything)", async () => {
      expect(await answer(S["v1-everything"]!, harness, "PreToolUse")).toEqual({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: DENY_EVERYTHING },
      });
    });

    test("PreToolUse: deny with hint is reason, newline, hint (v1-deny)", async () => {
      expect(await answer(S["v1-deny"]!, harness, "PreToolUse")).toEqual({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: DENY_WITH_HINT },
      });
    });

    test("PreToolUse: allow is not encoded (v1-allow -> {})", async () => {
      expect(await answer(S["v1-allow"]!, harness, "PreToolUse")).toEqual({});
    });

    test("PreToolUse: continue is not encoded (v1-continue -> {})", async () => {
      expect(await answer(S["v1-continue"]!, harness, "PreToolUse")).toEqual({});
    });

    test("PreToolUse: context only is additionalContext (v1-clears)", async () => {
      expect(await answer(S["v1-clears"]!, harness, "PreToolUse")).toEqual({
        hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "V1-CLEARED" },
      });
    });

    test("PreToolUse: deny from a layer below wins over context from the layer above (v1-clears outermost, v1-deny inside)", async () => {
      expect(await answer(S.layered!, harness, "PreToolUse")).toEqual({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: DENY_WITH_HINT },
      });
    });

    // permission-request: deny and allow are decision.behavior; deny wins; continue and context are not encoded
    test("PermissionRequest: deny wins over allow (v1-everything)", async () => {
      expect(await answer(S["v1-everything"]!, harness, "PermissionRequest")).toEqual({
        hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: DENY_EVERYTHING } },
      });
    });

    test("PermissionRequest: deny with hint (v1-deny)", async () => {
      expect(await answer(S["v1-deny"]!, harness, "PermissionRequest")).toEqual({
        hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: DENY_WITH_HINT } },
      });
    });

    test("PermissionRequest: allow is exactly the allow body with no extra keys (v1-allow)", async () => {
      expect(await answer(S["v1-allow"]!, harness, "PermissionRequest")).toEqual({
        hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } },
      });
    });

    test("PermissionRequest: continue is not encoded (v1-continue -> {})", async () => {
      expect(await answer(S["v1-continue"]!, harness, "PermissionRequest")).toEqual({});
    });

    test("PermissionRequest: context is not encoded (v1-clears -> {})", async () => {
      expect(await answer(S["v1-clears"]!, harness, "PermissionRequest")).toEqual({});
    });

    // stop: continue is decision block; deny, allow and context are not encoded
    for (const event of ["Stop", "SubagentStop"]) {
      test(`${event}: deny is not encoded (v1-deny -> {})`, async () => {
        expect(await answer(S["v1-deny"]!, harness, event)).toEqual({});
      });

      test(`${event}: continue is block with reason only (v1-everything)`, async () => {
        expect(await answer(S["v1-everything"]!, harness, event)).toEqual({ decision: "block", reason: CONTINUE_ONE });
      });

      test(`${event}: continue lists the missing items (v1-continue)`, async () => {
        expect(await answer(S["v1-continue"]!, harness, event)).toEqual({ decision: "block", reason: CONTINUE_MISSING });
      });

      test(`${event}: allow is not encoded (v1-allow -> {})`, async () => {
        expect(await answer(S["v1-allow"]!, harness, event)).toEqual({});
      });

      test(`${event}: context is not encoded (v1-clears -> {})`, async () => {
        expect(await answer(S["v1-clears"]!, harness, event)).toEqual({});
      });
    }

    // session-start: context only
    test("SessionStart: context is additionalContext; deny, continue and allow are not encoded (v1-everything)", async () => {
      expect(await answer(S["v1-everything"]!, harness, "SessionStart")).toEqual({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "V1-CONTEXT" },
      });
    });

    // v1-deny and v1-continue answer alone without calling next(), so the built-in session-start context is replaced by {}.
    test("SessionStart: deny is not encoded (v1-deny -> {})", async () => {
      expect(await answer(S["v1-deny"]!, harness, "SessionStart")).toEqual({});
    });

    test("SessionStart: continue is not encoded (v1-continue -> {})", async () => {
      expect(await answer(S["v1-continue"]!, harness, "SessionStart")).toEqual({});
    });

    // v1-allow calls next(), so the built-in session-start context survives; allow itself must add nothing.
    test("SessionStart: allow is not encoded (v1-allow -> the built-in answer only)", async () => {
      expect(await answer(S["v1-allow"]!, harness, "SessionStart")).toEqual(await answer(S.baseline!, harness, "SessionStart"));
    });

    // every other event: nothing (PostToolUse) and, for UserPromptSubmit, context only where the harness takes it
    test("PostToolUse: every field is not encoded (v1-everything -> {})", async () => {
      expect(await answer(S["v1-everything"]!, harness, "PostToolUse")).toEqual({});
    });

    test("UserPromptSubmit: follows the per-harness context rule (v1-everything)", async () => {
      const body = await answer(S["v1-everything"]!, harness, "UserPromptSubmit");
      if (harness === "codex") {
        expect(body).toEqual({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "V1-CONTEXT" } });
      } else {
        expect(body).toEqual({});
      }
    });
  });
}

describe("e2e: contract v1 encoding, opencode", () => {
  // tool.execute.before: deny only, as { deny: text }; the plugin throws it
  test("tool.execute.before: deny is { deny: reason and hint } (v1-deny)", async () => {
    expect(await answer(S["v1-deny"]!, "opencode", "tool.execute.before")).toEqual({ deny: DENY_WITH_HINT });
  });

  test("tool.execute.before: deny wins over context, continue and allow (v1-everything)", async () => {
    expect(await answer(S["v1-everything"]!, "opencode", "tool.execute.before")).toEqual({ deny: DENY_EVERYTHING });
  });

  test("tool.execute.before: allow is not encoded (v1-allow -> {})", async () => {
    expect(await answer(S["v1-allow"]!, "opencode", "tool.execute.before")).toEqual({});
  });

  test("tool.execute.before: continue is not encoded (v1-continue -> {})", async () => {
    expect(await answer(S["v1-continue"]!, "opencode", "tool.execute.before")).toEqual({});
  });

  test("tool.execute.before: context is not encoded (v1-clears -> {})", async () => {
    expect(await answer(S["v1-clears"]!, "opencode", "tool.execute.before")).toEqual({});
  });

  // permission.evaluate: nothing in v1 (the pre-tool deny refuses the call)
  test("permission.evaluate: deny is not encoded in v1 (v1-deny -> {})", async () => {
    expect(await answer(S["v1-deny"]!, "opencode", "permission.evaluate")).toEqual({});
  });

  test("permission.evaluate: every field is not encoded (v1-everything -> {})", async () => {
    expect(await answer(S["v1-everything"]!, "opencode", "permission.evaluate")).toEqual({});
  });

  test("permission.evaluate: allow is not encoded (v1-allow -> {})", async () => {
    expect(await answer(S["v1-allow"]!, "opencode", "permission.evaluate")).toEqual({});
  });

  test("permission.evaluate: continue is not encoded (v1-continue -> {})", async () => {
    expect(await answer(S["v1-continue"]!, "opencode", "permission.evaluate")).toEqual({});
  });

  // session.experimental.idle: continue only, as { continue: text }
  test("session.experimental.idle: continue lists the missing items (v1-continue)", async () => {
    expect(await answer(S["v1-continue"]!, "opencode", "session.experimental.idle")).toEqual({ continue: CONTINUE_MISSING });
  });

  test("session.experimental.idle: continue is the reason only (v1-everything)", async () => {
    expect(await answer(S["v1-everything"]!, "opencode", "session.experimental.idle")).toEqual({ continue: CONTINUE_ONE });
  });

  test("session.experimental.idle: deny is not encoded (v1-deny -> {})", async () => {
    expect(await answer(S["v1-deny"]!, "opencode", "session.experimental.idle")).toEqual({});
  });

  test("session.experimental.idle: allow is not encoded (v1-allow -> {})", async () => {
    expect(await answer(S["v1-allow"]!, "opencode", "session.experimental.idle")).toEqual({});
  });

  test("session.experimental.idle: context is not encoded (v1-clears -> {})", async () => {
    expect(await answer(S["v1-clears"]!, "opencode", "session.experimental.idle")).toEqual({});
  });

  // other opencode events: nothing is encoded, whatever the layers say
  for (const event of ["session.execution.succeeded", "session.created", "tool.execute.after"]) {
    test(`${event}: every field is not encoded (v1-everything -> {})`, async () => {
      expect(await answer(S["v1-everything"]!, "opencode", event)).toEqual({});
    });
  }

  test("session.execution.succeeded: continue is not encoded (v1-continue -> {})", async () => {
    expect(await answer(S["v1-continue"]!, "opencode", "session.execution.succeeded")).toEqual({});
  });

  test("session.execution.succeeded: deny is not encoded (v1-deny -> {})", async () => {
    expect(await answer(S["v1-deny"]!, "opencode", "session.execution.succeeded")).toEqual({});
  });

  test("session.created: context is not encoded on opencode (v1-clears -> {})", async () => {
    expect(await answer(S["v1-clears"]!, "opencode", "session.created")).toEqual({});
  });
});
