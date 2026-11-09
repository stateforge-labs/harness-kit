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

export interface TailText {
  append(chunk: string): void;
  read(): string;
}

export function tailText(limitBytes: number): TailText {
  const chunks: { readonly text: string; readonly bytes: number }[] = [];
  let total = 0;
  return {
    append(chunk) {
      const bytes = Buffer.byteLength(chunk);
      chunks.push({ text: chunk, bytes });
      total += bytes;
      while (chunks.length > 1 && total - (chunks[0]?.bytes ?? 0) >= limitBytes) {
        total -= chunks.shift()?.bytes ?? 0;
      }
    },
    read: () => tailBytes(chunks.map((entry) => entry.text).join(""), limitBytes),
  };
}
