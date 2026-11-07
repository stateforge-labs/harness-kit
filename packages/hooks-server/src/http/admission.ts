import { timingSafeEqual } from "node:crypto";
import { isLoopbackHost } from "../net.ts";

/**
 * Who may post. With a token, only a request that carries it: a web page cannot add an Authorization header without a
 * preflight, so no further check is needed. With no token the server is open on loopback, which a web page in the user's browser
 * can also reach, so it also requires a loopback Host (stops DNS rebinding) and a JSON content type (a cross-site form or
 * no-cors fetch cannot send one).
 */
export class Admission {
  readonly #token: string;

  constructor(token: string) {
    this.#token = token;
  }

  /** The refusal to send, or null to admit the request. */
  check(req: Request): Response | null {
    return this.#token !== "" ? this.#checkToken(req) : this.#checkLoopback(req);
  }

  #checkToken(req: Request): Response | null {
    const given = Buffer.from(req.headers.get("authorization") ?? "");
    const want = Buffer.from(`Bearer ${this.#token}`);
    return given.length === want.length && timingSafeEqual(given, want) ? null : new Response("unauthorized", { status: 401 });
  }

  #checkLoopback(req: Request): Response | null {
    const host = req.headers.get("host");
    if (host !== null && !isLoopbackHost(host)) return new Response("forbidden host", { status: 403 });
    if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) {
      return new Response("expected content-type application/json", { status: 415 });
    }
    return null;
  }
}
