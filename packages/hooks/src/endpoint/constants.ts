import { Harness } from "../core/event.ts";

export const HOOK_ROUTE = /^\/hook(?:\/([^/]+))?$/;
export const HEALTH_PATH = "/healthz";
export const DEFAULT_HARNESS = Harness.Claude;
export const LOOPBACK_NAME = "localhost";
export const JSON_CONTENT_TYPE = /^application\/json\b/i;
export const BEARER_PREFIX = "Bearer ";
export const PLACEHOLDER_ORIGIN = "http://hook.invalid";

export const Header = {
  Authorization: "authorization",
  ContentType: "content-type",
  ContentLength: "content-length",
  Host: "host",
  Connection: "connection",
} as const;

export const Status = {
  Ok: 200,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  PayloadTooLarge: 413,
  UnsupportedMediaType: 415,
  Internal: 500,
} as const;

export const Reply = {
  Ok: "ok",
  BadRequest: "bad request",
  Unauthorized: "unauthorized",
  ForbiddenHost: "forbidden host",
  NotFound: "not found",
  MethodNotAllowed: "method not allowed",
  PayloadTooLarge: "payload too large",
  ExpectedJsonContentType: "expected content-type application/json",
  InvalidJson: "invalid JSON",
  ExpectedObject: "expected a JSON object",
  Internal: "internal error",
} as const;

export const AdmissionMode = { Token: "token", Loopback: "loopback" } as const;

export const Failure = {
  EmptyToken: "createHookHandler: a token admission needs a non-empty token",
  MaxBodyBytes: "createHookHandler: maxBodyBytes must be a positive whole number",
  NoBun: "serveBun: this runtime has no Bun global; use serveNode",
  NoListen: "serve: listen needs a port and host, or a socketPath",
  BadAddress: "serve: the server did not report a TCP address",
} as const;
