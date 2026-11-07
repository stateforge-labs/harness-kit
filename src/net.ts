// Is this host name or address the local machine? Built on Node's own URL parser (which canonicalises 127.1, 0x7f.1, 2130706433,
// [::ffff:127.0.0.1] and the like), net.isIP and net.BlockList, so no address form is parsed by hand.
import { BlockList, isIP } from "node:net";

const LOOPBACK = new BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK.addAddress("::1", "ipv6");

/**
 * The host name of a bare `host` or `host:port` (a Host header, or a bind address), or null when it is anything else:
 * empty, malformed, or carrying a user, path or query (`user@localhost`, `localhost/x`). IPv6 comes back without brackets.
 */
export function hostnameOf(hostPort: string): string | null {
  let url: URL;
  try {
    url = new URL(`http://${hostPort}`);
  } catch {
    return null;
  }
  const bare = url.username === "" && url.password === "" && url.pathname === "/" && url.search === "" && url.hash === "";
  return bare && url.hostname !== "" ? url.hostname.replace(/^\[(.*)\]$/, "$1") : null;
}

/** True for 127.0.0.0/8, ::1 (also written 0:0:0:0:0:0:0:1 or ::ffff:127.0.0.1), `localhost` and any `*.localhost`. */
export function isLoopbackHost(hostPort: string): boolean {
  const name = hostnameOf(hostPort);
  if (name === null) return false;
  const family = isIP(name);
  if (family === 4) return LOOPBACK.check(name, "ipv4");
  if (family === 6) return LOOPBACK.check(name, "ipv6");
  return name === "localhost" || name.endsWith(".localhost");
}
