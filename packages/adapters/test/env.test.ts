import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { EnvVar, adapterEnv } from "../src/env.ts";

describe("adapterEnv", () => {
  test("defaults derive from HOME", () => {
    expect(adapterEnv({ HOME: "/h/u" })).toEqual({
      home: "/h/u",
      xdgDataHome: join("/h/u", ".local", "share"),
      codexHome: join("/h/u", ".codex"),
    });
  });

  test("explicit variables win over the defaults", () => {
    expect(
      adapterEnv({ HOME: "/h/u", XDG_DATA_HOME: "/data", CODEX_HOME: "/codex" }),
    ).toEqual({ home: "/h/u", xdgDataHome: "/data", codexHome: "/codex" });
  });

  test("an empty variable counts as unset", () => {
    expect(adapterEnv({ HOME: "", XDG_DATA_HOME: "", CODEX_HOME: "" })).toEqual({
      home: homedir(),
      xdgDataHome: join(homedir(), ".local", "share"),
      codexHome: join(homedir(), ".codex"),
    });
  });

  test("the variable names are the documented ones", () => {
    expect(EnvVar).toEqual({ Home: "HOME", XdgDataHome: "XDG_DATA_HOME", CodexHome: "CODEX_HOME" });
  });
});
