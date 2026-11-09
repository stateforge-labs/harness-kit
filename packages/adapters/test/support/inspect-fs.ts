import type { RuntimeFs } from "../../src/core/io.ts";

export interface FakeFs extends RuntimeFs {
  readonly reads: string[];
}

export function fakeFs(options: { readonly files?: readonly string[]; readonly texts?: Readonly<Record<string, string>> } = {}): FakeFs {
  const files = new Set(options.files ?? []);
  const texts = new Map(Object.entries(options.texts ?? {}));
  const reads: string[] = [];
  return {
    reads,
    async makeTempDir() {
      return null;
    },
    async removeTree() {
      return false;
    },
    async listDir() {
      return null;
    },
    async exists(path) {
      return files.has(path);
    },
    async isExecutable() {
      return false;
    },
    async readText(path, maxBytes) {
      reads.push(path);
      const text = texts.get(path);
      return text === undefined ? null : text.slice(0, maxBytes);
    },
  };
}
