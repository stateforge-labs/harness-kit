export const SECRET_BRAND = Symbol.for("stateforge-labs.secret");

export interface Secret {
  readonly [SECRET_BRAND]: true;
}
