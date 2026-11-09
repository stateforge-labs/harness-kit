import { TextLine } from "./constants.ts";

export interface LineAssembler {
  push(chunk: string): string[];
  flush(): string[];
}

export function lineAssembler(): LineAssembler {
  let pending: string = TextLine.Empty;
  return {
    push(chunk) {
      const parts = (pending + chunk).split(TextLine.Break);
      pending = parts.pop() ?? TextLine.Empty;
      return parts;
    },
    flush() {
      const rest = pending;
      pending = TextLine.Empty;
      return rest === TextLine.Empty ? [] : [rest];
    },
  };
}
