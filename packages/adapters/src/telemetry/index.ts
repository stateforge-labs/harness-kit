import type { EnvSource } from "../env.ts";

export const RESOURCE_ATTRIBUTES_ENV = "OTEL_RESOURCE_ATTRIBUTES" as const;

export interface JobAttribute {
  readonly key: string;
  readonly value: string;
}

export function serializeJobAttribute(attribute: JobAttribute): string {
  if (attribute.key === "") {
    throw new TypeError("job attribute key is empty");
  }
  if (attribute.value === "") {
    throw new TypeError("job attribute value is empty");
  }
  if (attribute.key.includes("=") || attribute.key.includes(",")) {
    throw new TypeError("job attribute key contains = or ,");
  }
  return `${attribute.key}=${encodeURIComponent(attribute.value)}`;
}

function keyOf(entry: string): string | null {
  const equals = entry.indexOf("=");
  return equals < 0 ? null : entry.slice(0, equals).trim();
}

export function mergeResourceAttributes(inherited: string | undefined, attribute: JobAttribute): string {
  const serialized = serializeJobAttribute(attribute);
  const kept = inherited?.split(",").filter((entry) => entry !== "" && keyOf(entry) !== attribute.key) ?? [];
  return [...kept, serialized].join(",");
}

export function withJobAttribute(env: EnvSource, attribute: JobAttribute): EnvSource {
  return { ...env, [RESOURCE_ATTRIBUTES_ENV]: mergeResourceAttributes(env[RESOURCE_ATTRIBUTES_ENV], attribute) };
}
