import { isIPv4, isIPv6 } from "node:net";
import { LOOPBACK_NAME } from "./constants.ts";

const IPV4_LOOPBACK = /^127\./;
const IPV6_LOOPBACK = "::1";
const IPV6_MAPPED_LOOPBACK = /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/;
const BRACKETS = /^\[(.*)\]$/;

/**
 * Whether a Host header value (host with an optional port) names this machine: `localhost`, 127.0.0.0/8, `::1`
 * or an IPv4-mapped loopback. Anything the URL parser would rewrite (`127.1`, `0x7f.1`, a userinfo part) is refused.
 */
export function isLoopbackHost(hostPort: string): boolean {
  let url: URL;
  try {
    url = new URL(`http://${hostPort}`);
  } catch {
    return false;
  }
  if (url.host !== hostPort.toLowerCase()) return false;
  const name = url.hostname.replace(BRACKETS, "$1");
  if (isIPv4(name)) return IPV4_LOOPBACK.test(name);
  if (isIPv6(name)) return name === IPV6_LOOPBACK || IPV6_MAPPED_LOOPBACK.test(name);
  return name === LOOPBACK_NAME;
}
