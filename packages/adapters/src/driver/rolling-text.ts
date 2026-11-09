import { Buffer } from "node:buffer";
import { tailBytes } from "../core/limits.ts";

export interface RollingText {
  append(chunk: string): void;
  read(): string;
}

export function rollingText(limitBytes: number, redact: (text: string) => string): RollingText {
  let text = "";
  return {
    append(chunk) {
      text = redact(text + chunk);
      if (Buffer.byteLength(text) > limitBytes) {
        text = tailBytes(text, limitBytes);
      }
    },
    read: () => text,
  };
}
