import { Kind, type Middleware } from "@homelab/harness-hooks";
export const OWN_PATH = "/srv/own-worktrees/managed";
const worktreeOwn: Middleware = async (ctx, next) => (ctx.event.kind === Kind.WorktreeCreate ? { worktree: { path: OWN_PATH } } : next());
export default worktreeOwn;
