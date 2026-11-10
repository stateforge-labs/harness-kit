import { isAbsolute, join } from "node:path";
import { EnvVar, Harness, adapters, denyText, renderCurlShim } from "@stateforge-labs/harness-hooks";
import { Engine } from "../../core/capability.ts";
import type { RunFailure } from "../../core/failure.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import type { AgentDirs, HookTarget } from "../types.ts";
import {
  COMMAND_HANDLER,
  HOOKS_FILE_INDENT,
  HOOKS_FILE_NAME,
  SHIM_FILE_PREFIX,
  SHIM_FILE_SUFFIX,
  SocketHarness,
  WIRING_CAPABILITY,
  WiringField,
  WiringMessage,
  WiringWhy,
} from "./constants.ts";

/** Files the consumer writes and environment the child gets so a command-hook harness reaches the consumer's endpoint. */
export interface SocketWiring {
  readonly files: readonly { readonly path: string; readonly text: string }[];
  readonly env: Readonly<Record<string, string>>;
}

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

const invalid = (field: string, message: string): Result<never, RunFailure> => fail({ kind: "invalid-config", message, field });

function codexHooksFile(shim: string): string {
  const events = Object.keys(adapters.get(Harness.Codex)?.jsonSchemas() ?? {}).sort();
  const hooks: Record<string, unknown[]> = {};
  for (const event of events) hooks[event] = [{ hooks: [{ type: COMMAND_HANDLER, command: `${quote(shim)} ${event}` }] }];
  return `${JSON.stringify({ hooks }, null, HOOKS_FILE_INDENT)}\n`;
}

/** Renders, writing nothing, the curl shim and the Codex hooks file under the shim directory; OpenCode is unsupported since its hooks are a plugin over HTTP. */
export function socketWiring(harness: SocketHarness, target: HookTarget, dirs: AgentDirs): Result<SocketWiring, RunFailure> {
  const { socket } = target;
  if (socket === null) return invalid(WiringField.Socket, WiringMessage.NoSocket);
  if (!isAbsolute(socket.path)) return invalid(WiringField.SocketPath, WiringMessage.NotAbsolute);
  if (!isAbsolute(socket.shimDir)) return invalid(WiringField.ShimDir, WiringMessage.NotAbsolute);
  if (harness === SocketHarness.OpenCode) {
    return fail({
      kind: "unsupported",
      message: WiringMessage.PluginSpeaksHttp,
      capability: WIRING_CAPABILITY,
      engine: Engine.Sdk,
      why: WiringWhy.PluginSpeaksHttp,
    });
  }
  const closed = target.pipeline.failClosed;
  const shimPath = join(socket.shimDir, `${SHIM_FILE_PREFIX}${harness}${SHIM_FILE_SUFFIX}`);
  const shim = renderCurlShim({
    harness,
    socketPath: socket.path,
    ...(closed ? { failClosed: true, denyReason: denyText(closed) } : {}),
  });
  const hooksPath = join(socket.shimDir, HOOKS_FILE_NAME);
  return ok({
    files: [
      { path: shimPath, text: shim },
      { path: hooksPath, text: codexHooksFile(shimPath) },
    ],
    env: { [EnvVar.CodexHome]: dirs.configDir },
  });
}
