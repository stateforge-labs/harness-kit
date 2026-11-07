# Plan: harness-kit (hooks + non-interactive harness adapters)

Decisions: [ADR 0001](../decisions/0001-library-layers-service-boundary.md), [ADR 0002](../decisions/0002-one-repo-for-hooks-and-non-interactive-adapters.md). Evidence: [R-2026-11-07-09](../research/studies/2026-11-07-harness-hooks-in-the-stateforge-runner/README.md).

Every phase ends green (`bun test`, `bunx tsc --noEmit`, `bun run gen:check`) and in one commit or a short series. Nothing in StateForge is
edited from here; StateForge-side steps are listed at the end for its own change process.

## Phase 0. Rename and record (small)

- Rename the folder `~/Projects/homelab/harness-hooks` to `harness-kit`; `package.json` name `harness-kit` (workspace root).
- Update what points at the old path: the printed Claude/Codex config blocks (`scripts/install.ts`), the unit template, docs, memory notes. The installed OpenCode plugin is a copy and needs no change.
- Create the GitLab remote (HTTPS push route) once the owner names the group.

## Phase 1. Feasibility capture (gate for phases 5–6)

One study (new R-id), same isolation rules as R-2026-11-07-08, Codex 0.167.0 and OpenCode 2.2.6 against a **local MCP server**:

1. Do pre/post tool hooks fire for MCP tool calls; what is the tool name format.
2. Can every built-in be disabled, or redirected to the bridge (COMP-R-016 allows either).
3. Does the post hook fire when an MCP call fails.
4. Effects of a deny on PreToolUse and of a block on Stop (Codex); of a throw in `tool.execute.before` (OpenCode).
5. Usage in the stream (seen already: Codex `input/output/cached/reasoning` tokens, OpenCode `tokens`, `cost`) mapped to one shape.
6. Resume: can a Codex rollout / OpenCode session be exported and imported in a fresh home (COMP-R-060).
7. Hook timeouts on each harness.

**Gate:** if 1 or 2 fails for a harness, that harness has no non-interactive adapter under ADR-0420; the package starts with Claude only.

## Phase 2. Workspace split, no behaviour change

- Bun workspace: `packages/hooks` (core, adapters for hook payloads, pipeline, clients), `packages/hooks-server` (server, config, http, middleware loader, installers). Tests move with their package; same count, same results.
- `exports` maps; a script that fails the build when a package imports outside its allowed list.
- Hooks package runtime-neutral: builds to `dist` for Node (`rewriteRelativeImportExtensions`), no Bun APIs; shim runnable under Node.

## Phase 3. Contract v1 (ADR 0001)

- Event: `session`, `tool { name, callId }`.
- Reply: `deny { reason, hint? }`, `continue { missing[] }`; deny wins in composition.
- `pipeline.use(layer, { timeoutMs, onFault: "skip" | { deny } })`; `handle()` fail-closed for a deny layer; documented timeout ordering.
- Encoders for deny/continue per harness, each backed by a phase-1 capture and an e2e test.
- OpenCode plugin acts on an answer: awaits the reply, throws on deny.

## Phase 4. Stock layers

`stopGuard({ limit })`, `once(inject)`, `stripToolPrefix(prefix)`, a `refused` observer. E2E through the server and in-process.

## Phase 5. `packages/adapters`: the port and the Claude adapter

- The port, owned here, neutral: `start({ prompt, systemPrompt, outputSchema?, model, mcp: { url, bearer }, pipeline, sessions?, environment }) -> Run { events, cancel }`; events `turn | usage(raw tokens, model) | session | output | failed | cancelled | refused`; capabilities `{ harness, hookPoints, resumes, reportsUsage }`.
- **Bring the Claude adapter in from StateForge** (`packages/agent-host/src/infrastructure/claude/*` at `overnight/sandbox` @ `5d8ac421`): hermetic options, SDK hooks via a pipeline layer, stream translation, session store. StateForge specifics become inputs: first-prompt and feedback texts, `StructuredOutput`, the `sf` server name, the refusal body, pricing (removed: raw tokens out).
- Session persistence as an opaque append/load port.
- A capability manifest (JSON per release) for the control plane's publish check and the Runner's `harnesses` field.
- The library's own tests use a scripted query function (as StateForge's contract test does) plus one live test behind a flag.

## Phase 6. Codex and OpenCode adapters (only what phase 1 allowed)

Hermetic home or config directory written per run, hooks through the shim or plugin to an in-process endpoint, stream to events, usage,
resume as phase 1 found possible.

## Phase 7. Embeddable endpoint and release

Web-standard handler with Node and Bun binders (TCP and unix socket); semver (neutral type or encode rule change = major); publish to the
owner's registry.

## StateForge side (its change process, not done here)

ADR for the external dependency and the ADR-0181 exception; agent host takes the harness name at start and uses `harness-adapters`;
a `snapshotLayer` plus prompt/refusal/pricing inputs; Runner drops rows 1–4 and fills `harnesses` from the image; contract suite
(COMP-R-029) runs against the library; model relay and credentials for non-Anthropic providers.

## Open

GitLab group for the remote; registry choice; whether resume is feasible for Codex/OpenCode; the in-sandbox endpoint rule.
