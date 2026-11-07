// Is this Host header (or bind address) the local machine?
// IP classification is ipaddr.js (range() === "loopback" covers 127.0.0.0/8, ::1 and IPv4-mapped forms such as ::ffff:127.0.0.1).
// Splitting the `host[:port]` is the URL parser's job. Anything the parser would rewrite or add to (a user part, a path, a query, a
// numeric spelling such as 127.1 or 0x7f.1) is refused rather than interpreted: real clients send the canonical form, and not guessing
// what a header "really" means keeps this check small. The only name accepted is `localhost`; no DNS lookup is ever made.
import ipaddr from "ipaddr.js";

/** True for `localhost`, an IPv4 address in 127.0.0.0/8 or `::1`, with an optional port, written in its canonical form. */
export function isLoopbackHost(hostPort: string): boolean {
  let url: URL;
  try {
    url = new URL(`http://${hostPort}`);
  } catch {
    return false;
  }
  if (url.host !== hostPort.toLowerCase()) return false; // the parser changed it or found more than host:port in it
  const name = url.hostname.replace(/^\[(.*)\]$/, "$1");
  return ipaddr.isValid(name) ? ipaddr.process(name).range() === "loopback" : name === "localhost";
}
