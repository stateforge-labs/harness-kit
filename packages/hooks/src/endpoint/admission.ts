import { createHash, timingSafeEqual } from "node:crypto";
import { AdmissionMode, BEARER_PREFIX, Failure, Header, JSON_CONTENT_TYPE, Reply, Status } from "./constants.ts";
import { isLoopbackHost } from "./loopback.ts";

/** How the endpoint decides who may post a hook: a shared bearer token, or a loopback Host header plus a JSON content type. */
export type AdmissionConfig = { mode: typeof AdmissionMode.Token; token: string } | { mode: typeof AdmissionMode.Loopback };

export type Admit = (req: Request) => Response | null;

const text = (body: string, status: number) => new Response(body, { status });

const digest = (value: string) => createHash("sha256").update(value).digest();

export function createAdmission(config: AdmissionConfig): Admit {
  if (config.mode === AdmissionMode.Token) {
    if (config.token === "") throw new TypeError(Failure.EmptyToken);
    const want = digest(`${BEARER_PREFIX}${config.token}`);
    return (req) => (timingSafeEqual(digest(req.headers.get(Header.Authorization) ?? ""), want) ? null : text(Reply.Unauthorized, Status.Unauthorized));
  }
  return (req) => {
    const host = req.headers.get(Header.Host);
    if (host !== null && !isLoopbackHost(host)) return text(Reply.ForbiddenHost, Status.Forbidden);
    if (!JSON_CONTENT_TYPE.test(req.headers.get(Header.ContentType) ?? "")) return text(Reply.ExpectedJsonContentType, Status.UnsupportedMediaType);
    return null;
  };
}
