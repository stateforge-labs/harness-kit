import { mergeReplies, type Middleware } from "@stateforge-labs/harness-hooks";
let runs = 0;
const counts: Middleware = async (_ctx, next) => mergeReplies(await next(), { context: `runs=${++runs}` });
export default counts;
