/** Any value that survives JSON.stringify and JSON.parse unchanged. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
