import { str, type Row } from "./rows.ts";

export function firstText(input: Row, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = str(input[key]);
    if (value !== null && value !== "") {
      return value;
    }
  }
  return null;
}
