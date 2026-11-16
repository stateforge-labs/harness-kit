import { describe, expect, test } from "bun:test";
import { mergeResourceAttributes, RESOURCE_ATTRIBUTES_ENV, serializeJobAttribute, withJobAttribute } from "../../src/telemetry/index.ts";

const KEY = "example.job";
const job = (value: string) => ({ key: KEY, value });

describe("serializeJobAttribute", () => {
  test("writes key=value with the value percent-encoded", () => {
    expect(serializeJobAttribute(job("judge"))).toBe("example.job=judge");
    expect(serializeJobAttribute(job("a b,c=d"))).toBe(`example.job=${encodeURIComponent("a b,c=d")}`);
  });

  test("throws a TypeError on an empty key or value, or on = or , in the key", () => {
    for (const bad of [{ key: "", value: "v" }, { key: KEY, value: "" }, { key: "a=b", value: "v" }, { key: "a,b", value: "v" }]) {
      expect(() => serializeJobAttribute(bad)).toThrow(TypeError);
    }
  });
});

describe("mergeResourceAttributes", () => {
  test("preserves unrelated entries and replaces only the exact trimmed key", () => {
    expect(mergeResourceAttributes(undefined, job("judge"))).toBe("example.job=judge");
    expect(mergeResourceAttributes("", job("judge"))).toBe("example.job=judge");
    expect(mergeResourceAttributes(",,a=b,,", job("judge"))).toBe("a=b,example.job=judge");
    expect(mergeResourceAttributes("x=a=b,broken,, =v, example.job =old,z=3", job("judge"))).toBe("x=a=b,broken, =v,z=3,example.job=judge");
    expect(mergeResourceAttributes("example.job-other=x, example.job=old", job("judge"))).toBe("example.job-other=x,example.job=judge");
  });

  test("an invalid attribute throws a TypeError", () => {
    expect(() => mergeResourceAttributes("a=b", job(""))).toThrow(TypeError);
  });
});

describe("withJobAttribute", () => {
  test("names the OpenTelemetry resource attributes variable", () => {
    expect(RESOURCE_ATTRIBUTES_ENV).toBe("OTEL_RESOURCE_ATTRIBUTES");
  });

  test("returns a new environment with the attribute merged and leaves the given one unchanged", () => {
    const env = Object.freeze({ PATH: "/bin", OTEL_RESOURCE_ATTRIBUTES: "service.name=parent,example.job=parent" });
    const tagged = withJobAttribute(env, job("judge"));
    expect(tagged).toEqual({ PATH: "/bin", OTEL_RESOURCE_ATTRIBUTES: "service.name=parent,example.job=judge" });
    expect(tagged).not.toBe(env);
    expect(env).toEqual({ PATH: "/bin", OTEL_RESOURCE_ATTRIBUTES: "service.name=parent,example.job=parent" });
  });

  test("adds the variable when the environment has none", () => {
    expect(withJobAttribute({ PATH: "/bin" }, job("curator"))).toEqual({ PATH: "/bin", OTEL_RESOURCE_ATTRIBUTES: "example.job=curator" });
  });
});
