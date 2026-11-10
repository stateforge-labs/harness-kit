import type { StoreEntry, StoreKey, TranscriptStore } from "../agent/types.ts";
import { FAKE_STORE_APPEND_FAILURE, FAKE_STORE_SEPARATOR } from "./agent-constants.ts";

function textOf(key: StoreKey): string {
  return [key.projectKey, key.sessionId, ...(key.subpath === undefined ? [] : [key.subpath])].join(FAKE_STORE_SEPARATOR);
}

/** An in-memory transcript store. It applies no dedupe, because dedupe belongs to the consumer. */
export type FakeTranscriptStore = TranscriptStore & {
  readonly entries: ReadonlyMap<string, readonly StoreEntry[]>;
  failNext(): void;
};

/** A transcript store for tests: appends accumulate per key, and `failNext()` makes the next append reject once. */
export function fakeTranscriptStore(): FakeTranscriptStore {
  const entries = new Map<string, StoreEntry[]>();
  const keys = new Map<string, StoreKey>();
  let failures = 0;
  return {
    entries,
    failNext() {
      failures += 1;
    },
    append(key, added) {
      if (failures > 0) {
        failures -= 1;
        return Promise.reject(new Error(FAKE_STORE_APPEND_FAILURE));
      }
      const text = textOf(key);
      keys.set(text, key);
      entries.set(text, [...(entries.get(text) ?? []), ...added]);
      return Promise.resolve();
    },
    load(key) {
      const found = entries.get(textOf(key));
      return Promise.resolve(found === undefined ? null : [...found]);
    },
    listSubkeys(key) {
      const base = key.subpath === undefined ? "" : `${key.subpath}${FAKE_STORE_SEPARATOR}`;
      const subkeys: string[] = [];
      for (const known of keys.values()) {
        if (known.projectKey === key.projectKey && known.sessionId === key.sessionId && known.subpath !== undefined && known.subpath.startsWith(base)) {
          subkeys.push(known.subpath.slice(base.length));
        }
      }
      return Promise.resolve(subkeys);
    },
  };
}
