/** Success or failure as a value. */
export type Result<T, F> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: F };

/** Wraps a value as a successful Result. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Wraps a failure as a failed Result. */
export function fail<F>(failure: F): Result<never, F> {
  return { ok: false, failure };
}
