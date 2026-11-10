import { describe, expect, test } from "bun:test";
import { fakeTranscriptStore } from "../../../src/testing/index.ts";

const k = (sessionId: string) => ({ projectKey: "p", sessionId });

describe("fakeTranscriptStore", () => {
  test("appends accumulate per key and load returns them", async () => {
    const store = fakeTranscriptStore();
    await store.append(k("a"), [{ uuid: "1", json: "{}" }]);
    await store.append(k("a"), [{ uuid: "2", json: "{}" }]);
    await store.append(k("b"), [{ uuid: "3", json: "{}" }]);
    expect((await store.load(k("a")))?.map((entry) => entry.uuid)).toEqual(["1", "2"]);
    expect(await store.load(k("missing"))).toBeNull();
    expect([...store.entries.keys()]).toEqual(["p/a", "p/b"]);
    expect(store.entries.get("p/b")?.[0]?.uuid).toBe("3");
  });

  test("dedupe is not applied", async () => {
    const store = fakeTranscriptStore();
    const entry = { uuid: "same", json: "{}" };
    await store.append(k("a"), [entry]);
    await store.append(k("a"), [entry, entry]);
    expect(store.entries.get("p/a")).toHaveLength(3);
  });

  test("failNext makes only the next append reject, and stores nothing for it", async () => {
    const store = fakeTranscriptStore();
    store.failNext();
    await expect(store.append(k("a"), [{ uuid: "1", json: "{}" }])).rejects.toThrow("FAKE");
    expect(store.entries.has("p/a")).toBe(false);
    await store.append(k("a"), [{ uuid: "2", json: "{}" }]);
    expect(store.entries.get("p/a")?.map((entry) => entry.uuid)).toEqual(["2"]);
  });

  test("load returns a copy, so later appends do not change what was read", async () => {
    const store = fakeTranscriptStore();
    await store.append(k("a"), [{ uuid: "1", json: "{}" }]);
    const first = await store.load(k("a"));
    await store.append(k("a"), [{ uuid: "2", json: "{}" }]);
    expect(first).toHaveLength(1);
  });

  test("listSubkeys lists the subpaths below a key", async () => {
    const store = fakeTranscriptStore();
    await store.append({ projectKey: "proj", sessionId: "s1" }, [{ uuid: "1", json: "{}" }]);
    await store.append({ projectKey: "proj", sessionId: "s1", subpath: "subagents/a" }, [{ uuid: "2", json: "{}" }]);
    await store.append({ projectKey: "proj", sessionId: "s1", subpath: "subagents/b" }, [{ uuid: "3", json: "{}" }]);
    await store.append({ projectKey: "proj", sessionId: "s2", subpath: "subagents/c" }, [{ uuid: "4", json: "{}" }]);
    expect([...(await store.listSubkeys({ projectKey: "proj", sessionId: "s1" }))].sort()).toEqual(["subagents/a", "subagents/b"]);
    expect(await store.listSubkeys({ projectKey: "proj", sessionId: "s1", subpath: "subagents" })).toEqual(["a", "b"]);
    expect(await store.listSubkeys({ projectKey: "none", sessionId: "s1" })).toEqual([]);
  });
});
