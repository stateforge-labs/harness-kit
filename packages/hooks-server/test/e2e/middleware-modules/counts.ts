// Counts how many times the layers below the one above it ran; the count is in the reply.
import { mergeReplies, type Middleware } from "@homelab/harness-hooks";
let runs = 0;
const counts: Middleware = async (_ctx, next) => mergeReplies(await next(), { context: `runs=${++runs}` });
export default counts;
