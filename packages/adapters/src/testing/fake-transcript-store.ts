import type { StoreEntry, TranscriptStore } from "../agent/types.ts";
import { FAKE_STORE_APPEND_FAILURE, FAKE_STORE_SEPARATOR } from "./agent-constants.ts";

/** An in-memory transcript store. It applies no dedupe, because dedupe belongs to the consumer. */
export type FakeTranscriptStore = TranscriptStore & {
  readonly entries: ReadonlyMap<string, readonly StoreEntry[]>;
  failNext(): void;
};

/** A transcript store for tests: appends accumulate per key, and `failNext()` makes the next append reject once. */
export function fakeTranscriptStore(): FakeTranscriptStore {
  const entries = new Map<string, StoreEntry[]>();
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
      entries.set(key, [...(entries.get(key) ?? []), ...added]);
      return Promise.resolve();
    },
    load(key) {
      const found = entries.get(key);
      return Promise.resolve(found === undefined ? null : [...found]);
    },
    listSubkeys(key) {
      const prefix = `${key}${FAKE_STORE_SEPARATOR}`;
      const subkeys = new Set<string>();
      for (const known of entries.keys()) {
        if (known.startsWith(prefix)) {
          subkeys.add(known.slice(prefix.length).split(FAKE_STORE_SEPARATOR)[0] ?? "");
        }
      }
      return Promise.resolve([...subkeys]);
    },
  };
}
