#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_NAME="$1"; PROMPT="$2"; shift 2
OUT="$ROOT/captures/$OUT_NAME"
mkdir -p "$OUT"; : > "$OUT/events.jsonl"
TOKEN="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
export CAPTURE_LOG="$OUT/events.jsonl" CAPTURE_TOKEN="$TOKEN"
bun "$ROOT/tools/capture-server.ts" > "$OUT/server.out" 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 50); do PORT=$(sed -n 's/.*listening on :\([0-9]*\).*/\1/p' "$OUT/server.out"); [ -n "$PORT" ] && break; sleep 0.1; done
[ -n "${PORT:-}" ] || { echo "capture server failed" >&2; exit 1; }
EVENTS="${CAPTURE_EVENTS:-ConfigChange,CwdChanged,DirectoryAdded,Elicitation,ElicitationResult,FileChanged,InstructionsLoaded,MessageDisplay,Notification,PermissionDenied,PermissionRequest,PostCompact,PostModelSwitch,PostToolBatch,PostToolUse,PostToolUseFailure,PreCompact,PreModelSwitch,PreToolUse,SessionEnd,SessionStart,Setup,Stop,StopFailure,SubagentStart,SubagentStop,TaskCompleted,TaskCreated,TeammateIdle,UserPromptExpansion,UserPromptSubmit,WorktreeCreate,WorktreeRemove}"
python3 - "$OUT/settings.json" "$EVENTS" "$PORT" "${CAPTURE_MATCHER:-}" <<'PY'
import json, sys
path, events, port, matcher = sys.argv[1], sys.argv[2].split(","), sys.argv[3], sys.argv[4]
cmd_only = {"SessionStart", "Setup"}
url = f"http://127.0.0.1:{port}/hook"
hooks = {}
for e in events:
    if e in cmd_only:
        h = {"type": "command", "timeout": 5,
             "command": f'curl -s -m 4 -X POST {url} -H "Authorization: Bearer $CAPTURE_TOKEN" -H "content-type: application/json" --data-binary @-'}
    else:
        h = {"type": "http", "url": url, "timeout": 5, "headers": {"Authorization": "Bearer $CAPTURE_TOKEN"}, "allowedEnvVars": ["CAPTURE_TOKEN"]}
    entry = {"hooks": [h]}
    if matcher: entry["matcher"] = matcher
    hooks[e] = [entry]
json.dump({"hooks": hooks}, open(path, "w"), indent=1)
PY
cd "${CAPTURE_CWD:-$(mktemp -d)}"
printf 'claude -p %q --settings %q --model haiku --max-turns 4 --output-format stream-json --verbose %s\n' "$PROMPT" "$OUT/settings.json" "$*" > "$OUT/cmd.txt"
timeout 170 claude -p "$PROMPT" --settings "$OUT/settings.json" --model haiku --max-turns 4 --output-format stream-json --verbose "$@" < /dev/null > "$OUT/stream.jsonl" 2> "$OUT/stderr.txt"
echo "exit=$? events captured:"; python3 - "$OUT/events.jsonl" <<'PY'
import json, sys, collections
c = collections.OrderedDict()
for l in open(sys.argv[1]):
    p = json.loads(l)["payload"] or {}
    n = p.get("hook_event_name", "?"); c.setdefault(n, []).append(sorted(p.keys()))
for n, ks in c.items(): print(f"  {n} x{len(ks)} keys={ks[0]}")
PY
