// @homelab/harness-hooks: the public surface. Anything not exported here is internal to the package.
export type { HarnessId, MetaValue, NeutralEvent, NeutralKind, Spawn, ToolRef } from "./core/event.ts";
export { continueText, denyText, type Continue, type Deny, type NeutralReply } from "./core/reply.ts";
export { toolAllowlist, type ToolAllowlistOptions } from "./core/layers.ts";
export { policy, type Rules } from "./core/policy.ts";
export {
  Pipeline,
  defaultPipeline,
  mergeReplies,
  onKinds,
  policyLayer,
  type FaultMode,
  type HookContext,
  type LayerOptions,
  type Middleware,
  type Next,
  type PipelineOptions,
} from "./core/pipeline.ts";
export type { Common, Decoded, HarnessAdapter } from "./port.ts";
export { handle, type Handled } from "./handle.ts";
export { adapters } from "./adapters/index.ts";
export { fixturesDir, opencodePluginPath, schemasDir, shimPath } from "./paths.ts";
