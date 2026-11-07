import type { Middleware } from "../../../src/core/pipeline.ts";
const hangs: Middleware = () => new Promise(() => {});
export default hangs;
