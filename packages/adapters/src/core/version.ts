const VERSION_PATTERN = /\d+\.\d+\.\d+\S*/u;

export function parseVersion(text: string): string | null {
  return VERSION_PATTERN.exec(text)?.[0] ?? null;
}
