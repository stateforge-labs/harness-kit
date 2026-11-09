import { fileURLToPath } from "node:url";

const built = import.meta.url.endsWith(".js");
const ext = built ? ".js" : ".ts";
const packageRoot = built ? "../../" : "../";
const at = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export const shimPath = at(`../clients/shim/hook-shim${ext}`);
export const opencodePluginPath = at(`../clients/opencode/plugin${ext}`);
export const schemasDir = at(`${packageRoot}schemas`);
