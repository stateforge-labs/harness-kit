import { mergeReplies, type Middleware } from "@stateforge-labs/harness-hooks";
const v1Allow: Middleware = async (_ctx, next) => mergeReplies(await next(), { allow: true });
export default v1Allow;
