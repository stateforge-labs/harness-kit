import ipaddr from "ipaddr.js";

export function isLoopbackHost(hostPort: string): boolean {
  let url: URL;
  try {
    url = new URL(`http://${hostPort}`);
  } catch {
    return false;
  }
  if (url.host !== hostPort.toLowerCase()) return false;
  const name = url.hostname.replace(/^\[(.*)\]$/, "$1");
  return ipaddr.isValid(name) ? ipaddr.process(name).range() === "loopback" : name === "localhost";
}
