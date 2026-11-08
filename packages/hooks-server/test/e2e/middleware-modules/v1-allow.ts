import { mergeReplies, type Middleware } from "@homelab/harness-hooks";
const v1Allow: Middleware = async (_ctx, next) => mergeReplies(await next(), { allow: true });
export default v1Allow;
