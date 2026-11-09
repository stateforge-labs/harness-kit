export const SOCKET_MODE = 0o600;
export const SOCKET_UMASK = 0o177;

export const SocketFailure = {
  NotSocket: (path: string) => `${path} exists and is not a socket; refusing to remove it`,
  InUse: (path: string) => `${path} is already served by another process`,
} as const;
