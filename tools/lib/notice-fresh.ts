const DAY_MS = 86_400_000;
const MAX_AGE_DAYS = 30;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_LENGTH = 10;

export function noticeIsFresh(retrievedAt: string, nowMs: number): boolean {
  if (!DATE_SHAPE.test(retrievedAt)) {
    return false;
  }
  const at = Date.parse(`${retrievedAt}T00:00:00Z`);
  if (Number.isNaN(at) || new Date(at).toISOString().slice(0, DATE_LENGTH) !== retrievedAt) {
    return false;
  }
  return nowMs - at <= MAX_AGE_DAYS * DAY_MS;
}
