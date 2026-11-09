export const SECRET_BRAND = Symbol.for("stateforge-labs.secret");
export const SECRET_REVEAL = Symbol.for("stateforge-labs.secret.reveal");

const SECRET_EMPTY = Symbol.for("stateforge-labs.secret.empty");
const Mask = { Text: "[secret]" } as const;
const InspectCustom = Symbol.for("nodejs.util.inspect.custom");

export interface Secret {
  readonly [SECRET_BRAND]: true;
  readonly [SECRET_REVEAL]: () => string;
}

class SecretValue implements Secret {
  readonly [SECRET_BRAND] = true as const;
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  [SECRET_REVEAL](): string {
    return this.#value;
  }

  [SECRET_EMPTY](): boolean {
    return this.#value === "";
  }

  toJSON(): string {
    return Mask.Text;
  }

  toString(): string {
    return Mask.Text;
  }

  valueOf(): string {
    return Mask.Text;
  }

  [Symbol.toPrimitive](): string {
    return Mask.Text;
  }

  [InspectCustom](): string {
    return Mask.Text;
  }
}

/** Wraps a credential value so it never prints, serialises or interpolates. */
export function secret(value: string): Secret {
  return Object.freeze(new SecretValue(value));
}

export function isSecret(value: unknown): value is Secret {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Reflect.get(value, SECRET_BRAND) === true && typeof Reflect.get(value, SECRET_REVEAL) === "function";
}

export function reveal(value: Secret): string {
  return value[SECRET_REVEAL]();
}

export function secretIsEmpty(value: Secret): boolean {
  const probe = Reflect.get(value, SECRET_EMPTY);
  if (typeof probe === "function") {
    return Reflect.apply(probe, value, []) === true;
  }
  return value[SECRET_REVEAL]() === "";
}
