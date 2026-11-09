export interface DirEntryInfo {
  readonly name: string;
  readonly mtimeMs: number;
  readonly isDirectory: boolean;
}

export interface RuntimeFs {
  makeTempDir(prefix: string, parent: string): Promise<string | null>;
  removeTree(path: string): Promise<boolean>;
  listDir(path: string): Promise<readonly DirEntryInfo[] | null>;
  exists(path: string): Promise<boolean>;
  isExecutable(path: string): Promise<boolean>;
  readText(path: string, maxBytes: number): Promise<string | null>;
}

export interface Clock {
  now(): number;
  after(ms: number, fn: () => void): () => void;
}
