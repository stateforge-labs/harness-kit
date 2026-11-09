import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
import { CLAUDE_TUI_CHROME, CODEX_TUI_CHROME, OPENCODE_TUI_CHROME, isChromeLine, tuiChrome } from "../../src/tui/index.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const HARNESSES: readonly HarnessId[] = [Harness.Claude, Harness.Codex, Harness.OpenCode];
const CLAUDE_FOOTER = "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt";
const BORDER_ALL = ["────────────────────", "╭──────────────╮", "│              │", "╰──────────────╯", "━━━━━━━━━━━━━━━━", "┃", ""];
const ORDINARY = ["Reading src/index.ts", "  if (count > 0) return count;", "● I fixed the parser and the tests pass now.", "  Ran 2 shell commands", "❯ run the tests again"];

const screenLines = (harness: string): string[] =>
  readFileSync(join(adaptersFixtures, harness, "screens", "idle.txt"), "utf8").split("\n");

const lineMatching = (lines: readonly string[], pattern: RegExp): string => {
  const found = lines.find((line) => pattern.test(line));
  if (found === undefined) throw new Error(`no captured line matches ${pattern.source}`);
  return found;
};

describe("Claude chrome patterns (synthetic lines, one per pattern)", () => {
  const cases: [string, string][] = [
    ["esc to interrupt", "  working on it · esc to interrupt"],
    ["shift+tab to cycle", "  shift+tab to cycle"],
    ["? for shortcuts", "  ? for shortcuts"],
    ["status symbol ⏵⏵", "  ⏵⏵ bypass permissions on"],
    ["bypass permissions on", "bypass permissions on"],
    ["auto-accept off", "  auto-accept off"],
    ["ctrl hint", "  (ctrl+o to expand)"],
    ["spinner with elapsed seconds", "✻ Brewing… (12s · ↓ 1.2k tokens)"],
    ["empty prompt", "❯ "],
    ["empty prompt with chevron", "› "],
  ];

  for (const [name, line] of cases) {
    test(`matches ${name}`, () => {
      expect(isChromeLine(Harness.Claude, line)).toBe(true);
    });
  }

  test("the Claude footer from the captured idle screen is chrome", () => {
    expect(isChromeLine(Harness.Claude, lineMatching(screenLines("claude"), /shift\+tab to cycle/))).toBe(true);
  });

  test("the captured empty prompt line (ends in a no-break space) is chrome", () => {
    expect(isChromeLine(Harness.Claude, lineMatching(screenLines("claude"), /^\s*❯\s*$/u))).toBe(true);
  });
});

describe("ordinary text is not chrome", () => {
  for (const harness of HARNESSES) {
    for (const line of ORDINARY) {
      test(`${harness}: "${line}" is content`, () => {
        expect(isChromeLine(harness, line)).toBe(false);
      });
    }
  }
});

describe("harness scoping (the regression behind the screen-reader bug)", () => {
  test("a Claude footer is not chrome for Codex or OpenCode", () => {
    expect(isChromeLine(Harness.Codex, CLAUDE_FOOTER)).toBe(false);
    expect(isChromeLine(Harness.OpenCode, CLAUDE_FOOTER)).toBe(false);
  });

  test("a Claude footer is chrome for Claude", () => {
    expect(isChromeLine(Harness.Claude, CLAUDE_FOOTER)).toBe(true);
  });
});

describe("box-only lines", () => {
  for (const harness of HARNESSES) {
    test(`${harness}: border rows and blank lines are chrome`, () => {
      for (const line of BORDER_ALL) {
        expect(isChromeLine(harness, line)).toBe(true);
      }
    });
  }

  test("OpenCode logo and rule rows (block and half-block glyphs) are chrome", () => {
    expect(isChromeLine(Harness.OpenCode, "                       ╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀")).toBe(true);
    expect(isChromeLine(Harness.OpenCode, "                                         █▀▀█ █▀▀█ █▀▀█ █▀▀▄ █▀▀▀")).toBe(true);
    expect(isChromeLine(Harness.OpenCode, "                                          ▄")).toBe(true);
  });

  test("Claude and Codex do not treat block glyphs as border", () => {
    expect(isChromeLine(Harness.Claude, "█▀▀█ █▀▀█")).toBe(false);
    expect(isChromeLine(Harness.Codex, "█▀▀█ █▀▀█")).toBe(false);
  });
});

describe("Codex chrome from the captured idle screen", () => {
  const lines = screenLines("codex");

  test("header, placeholder, model footer, shortcut hint and warning line are chrome", () => {
    for (const pattern of [/>_ OpenAI Codex/, /› Ask Codex to do anything/, /GPT-6\.1-Sol high · ~\//, /← for agents · \? for shortcuts/, /⚠ \d+ warning/]) {
      expect(isChromeLine(Harness.Codex, lineMatching(lines, pattern))).toBe(true);
    }
  });

  test("a typed Codex prompt line is content, not the placeholder", () => {
    expect(isChromeLine(Harness.Codex, "› fix the failing test")).toBe(false);
  });
});

describe("OpenCode chrome from the captured idle screen", () => {
  const lines = screenLines("opencode");

  test("placeholder, mode line, key hints and version line are chrome", () => {
    for (const pattern of [/Ask anything…/, /Build · /, /shift\+tab agents/, /^ {40,}2\.2\.6/]) {
      expect(isChromeLine(Harness.OpenCode, lineMatching(lines, pattern))).toBe(true);
    }
  });
});

describe("the per-harness records", () => {
  test("tuiChrome returns the record for each harness", () => {
    expect(tuiChrome(Harness.Claude)).toBe(CLAUDE_TUI_CHROME);
    expect(tuiChrome(Harness.Codex)).toBe(CODEX_TUI_CHROME);
    expect(tuiChrome(Harness.OpenCode)).toBe(OPENCODE_TUI_CHROME);
  });

  for (const harness of HARNESSES) {
    test(`${harness}: no pattern is global or sticky (test() is stateless)`, () => {
      const { boxOnly, lines } = tuiChrome(harness);
      for (const pattern of [boxOnly, ...lines]) {
        expect(pattern.global).toBe(false);
        expect(pattern.sticky).toBe(false);
      }
    });
  }

  test("repeated calls on the same line give the same answer", () => {
    for (let i = 0; i < 3; i++) {
      expect(isChromeLine(Harness.Claude, "❯ ")).toBe(true);
    }
  });
});
