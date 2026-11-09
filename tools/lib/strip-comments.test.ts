import { describe, expect, test } from "bun:test";
import { stripNonComments } from "./strip-comments.ts";

const lines = (src: string): number[] => stripNonComments(src).violations.map((v) => v.line);

describe("literals are not comments", () => {
  test("http:// inside a string is not a comment", () => {
    expect(stripNonComments('export const URL = "http://example.test/a";\n').violations).toEqual([]);
  });

  test("single-quoted and escaped quotes do not open a comment", () => {
    expect(stripNonComments("const a = 'it\\'s // not a comment';\nconst b = \"say \\\"// no\\\"\";\n").violations).toEqual([]);
  });

  test("the regex from src/tui/constants.ts is not a comment", () => {
    const src = "export const TuiLine = {\n  CodexModelFooter: /^\\s*[^·]+ · ~\\//u,\n} as const;\n";
    expect(stripNonComments(src).violations).toEqual([]);
  });

  test("a regex with a slash inside a character class is not a comment", () => {
    expect(stripNonComments("const r = /[/]+ x/g;\n").violations).toEqual([]);
  });

  test("template literal text containing // is not a comment", () => {
    expect(stripNonComments("const t = `https://x.test/${id}//tail`;\n").violations).toEqual([]);
  });

  test("a comment inside a template substitution is a violation", () => {
    expect(lines("const t = `a ${/* inside */ b}`;\n")).toEqual([1]);
  });

  test("an object literal inside a substitution keeps the template open", () => {
    expect(stripNonComments("const t = `x ${ {a: 1}.a } // text`;\n").violations).toEqual([]);
  });
});

describe("real comments", () => {
  test("a line comment is a violation", () => {
    expect(stripNonComments("const a = 1;\n// note\n")).toEqual({ violations: [{ line: 2, text: "// note" }] });
  });

  test("a trailing comment after code is a violation", () => {
    expect(lines("const a = 1; // note\n")).toEqual([1]);
  });

  test("a division is not mistaken for a regex", () => {
    expect(lines("const r = a / b; // note\n")).toEqual([1]);
  });

  test("a multi-line block comment above an export is a violation", () => {
    expect(lines("/**\n * Doc.\n */\nexport const X = 1;\n")).toEqual([1]);
  });

  test("a one-line TSDoc above an export is allowed", () => {
    expect(stripNonComments("/** The value. */\nexport const X = 1;\n").violations).toEqual([]);
  });

  test("a one-line TSDoc above a non-export is a violation", () => {
    expect(lines("/** Internal. */\nconst X = 1;\n")).toEqual([1]);
  });

  test("a one-line TSDoc with a blank line before the export is a violation", () => {
    expect(lines("/** Doc. */\n\nexport const X = 1;\n")).toEqual([1]);
  });

  test("a block comment that is not TSDoc above an export is a violation", () => {
    expect(lines("/* plain */\nexport const X = 1;\n")).toEqual([1]);
  });

  test("a TSDoc that trails code on its line is a violation", () => {
    expect(lines("const a = 1; /** Doc. */\nexport const X = 1;\n")).toEqual([1]);
  });

  test("reports the line of each comment", () => {
    expect(lines("const a = 1;\n\n/* one */ const b = 2;\nconst c = 3; // two\n")).toEqual([3, 4]);
  });

  test("an empty file has no violations", () => {
    expect(stripNonComments("").violations).toEqual([]);
  });
});
