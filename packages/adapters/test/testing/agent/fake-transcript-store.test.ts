import { describe, expect, test } from "bun:test";
import { fakeTranscriptStore } from "../../../src/testing/index.ts";

describe("fakeTranscriptStore", () => {
  test("appends accumulate per key and load returns them", async () => {
    const store = fakeTranscriptStore();
    await store.append("a", [{ uuid: "1", json: "{}" }]);
    await store.append("a", [{ uuid: "2", json: "{}" }]);
    await store.append("b", [{ uuid: "3", json: "{}" }]);
    expect((await store.load("a"))?.map((entry) => entry.uuid)).toEqual(["1", "2"]);
    expect(await store.load("missing")).toBeNull();
    expect([...store.entries.keys()]).toEqual(["a", "b"]);
    expect(store.entries.get("b")?.[0]?.uuid).toBe("3");
  });

  test("dedupe is not applied", async () => {
    const store = fakeTranscriptStore();
    const entry = { uuid: "same", json: "{}" };
    await store.append("a", [entry]);
    await store.append("a", [entry, entry]);
    expect(store.entries.get("a")).toHaveLength(3);
  });

  test("failNext makes only the next append reject, and stores nothing for it", async () => {
    const store = fakeTranscriptStore();
    store.failNext();
    await expect(store.append("a", [{ uuid: "1", json: "{}" }])).rejects.toThrow("FAKE");
    expect(store.entries.has("a")).toBe(false);
    await store.append("a", [{ uuid: "2", json: "{}" }]);
    expect(store.entries.get("a")?.map((entry) => entry.uuid)).toEqual(["2"]);
  });

  test("load returns a copy, so later appends do not change what was read", async () => {
    const store = fakeTranscriptStore();
    await store.append("a", [{ uuid: "1", json: "{}" }]);
    const first = await store.load("a");
    await store.append("a", [{ uuid: "2", json: "{}" }]);
    expect(first).toHaveLength(1);
  });

  test("listSubkeys lists the first segment below a key once", async () => {
    const store = fakeTranscriptStore();
    await store.append("proj/s1", [{ uuid: "1", json: "{}" }]);
    await store.append("proj/s1/sub-a", [{ uuid: "2", json: "{}" }]);
    await store.append("proj/s2", [{ uuid: "3", json: "{}" }]);
    await store.append("other/s9", [{ uuid: "4", json: "{}" }]);
    expect([...(await store.listSubkeys("proj"))].sort()).toEqual(["s1", "s2"]);
    expect(await store.listSubkeys("proj/s1")).toEqual(["sub-a"]);
    expect(await store.listSubkeys("none")).toEqual([]);
  });
});
