declare const brand: unique symbol;

export type SessionId = string & { readonly [brand]: true };

export function asSessionId(raw: string): SessionId | null {
  return raw === "" ? null : (raw as SessionId);
}
