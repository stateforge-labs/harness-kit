import { chmod, lstat, rm } from "node:fs/promises";
import { SOCKET_MODE, SOCKET_UMASK, SocketFailure } from "./constants.ts";

function isMissing(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

function accepts(path: string): Promise<boolean> {
  return Bun.connect({ unix: path, socket: { data() {}, open(s) { s.end(); }, error() {}, close() {} } }).then(
    () => true,
    () => false,
  );
}

/** Removes a socket file nobody listens on. Refuses a file that is not a socket and a socket another server still answers on. */
export async function clearStaleSocket(path: string): Promise<void> {
  let info;
  try {
    info = await lstat(path);
  } catch (err) {
    if (isMissing(err)) return;
    throw err;
  }
  if (!info.isSocket()) throw new Error(SocketFailure.NotSocket(path));
  if (await accepts(path)) throw new Error(SocketFailure.InUse(path));
  await rm(path);
}

/** Runs a bind with a umask that leaves the new socket file readable and writable by its owner only, then sets that mode explicitly. */
export async function bindUserOnly<T>(path: string, bind: () => Promise<T>): Promise<T> {
  const previous = process.umask(SOCKET_UMASK);
  let bound: T;
  try {
    bound = await bind();
  } finally {
    process.umask(previous);
  }
  await chmod(path, SOCKET_MODE);
  return bound;
}
