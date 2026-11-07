// @homelab/harness-hooks: the public surface. Anything not exported here is internal to the package.
export type { HarnessId, MetaValue, NeutralEvent, NeutralKind, Spawn } from "./core/event.ts";
export type { NeutralReply } from "./core/reply.ts";
export { policy, type Rules } from "./core/policy.ts";
export {
  Pipeline,
  defaultPipeline,
  mergeReplies,
  onKinds,
  policyLayer,
  type HookContext,
  type Middleware,
  type Next,
  type PipelineOptions,
} from "./core/pipeline.ts";
export type { Common, Decoded, HarnessAdapter } from "./port.ts";
export { handle, type Handled } from "./handle.ts";
export { adapters } from "./adapters/index.ts";
export { fixturesDir, opencodePluginPath, schemasDir, shimPath } from "./paths.ts";
