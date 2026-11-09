export const CurlTokenSource = { Env: "env", File: "file", None: "none" } as const;

export type CurlTokenSourceName = (typeof CurlTokenSource)[keyof typeof CurlTokenSource];

/** The oldest curl each token mechanism works with: `--variable` with `--expand-header` needs 8.3.0; a header file, and a shim with no token at all, need 7.55.0. */
export const CURL_MIN_VERSION: Readonly<Record<CurlTokenSourceName, string>> = {
  [CurlTokenSource.Env]: "8.3.0",
  [CurlTokenSource.File]: "7.55.0",
  [CurlTokenSource.None]: "7.55.0",
};

export const CURL_VERSION_PATTERN = /^curl (\d+)\.(\d+)\.(\d+)/;

export const SHIM_HARNESS_PATTERN = /^[a-z0-9-]+$/;
export const SHIM_EVENT_PATTERN = /^[A-Za-z0-9_-]+$/;

export const SHIM_FALLBACK_OPEN = "{}";
export const SHIM_OK_STATUS = 200;
export const SHIM_DEBUG_ON = "1";
export const SHIM_LOCAL_HOST = "http://localhost";
export const SHIM_HOOK_PATH = "/hook";
export const SHIM_NEWLINE_VAR = "nl";
export const SHIM_STATUS_MARKER = "\\n%{http_code}";
export const SHIM_CONTENT_TYPE_HEADER = "content-type: application/json";
export const SHIM_AUTH_HEADER = "authorization: Bearer";
