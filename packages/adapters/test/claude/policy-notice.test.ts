import { describe, expect, test } from "bun:test";
import { ClaudePolicy } from "../../src/claude/constants.ts";
import { CLAUDE_POLICY_RETRIEVED_AT, claudePolicyNotice } from "../../src/claude/policy-notice.ts";

const quoteTexts = (): string[] => ClaudePolicy.Quotes.map((quote) => quote.text);

describe("claudePolicyNotice", () => {
  test("api-key, cloud and unknown modes have no notice", () => {
    expect(claudePolicyNotice("api-key")).toBeNull();
    expect(claudePolicyNotice("cloud")).toBeNull();
    expect(claudePolicyNotice("bogus")).toBeNull();
  });

  test("login-store and token return the notice", () => {
    for (const mode of ["login-store", "token"]) {
      expect(claudePolicyNotice(mode)).toMatchObject({ harness: "claude", mode, retrievedAt: CLAUDE_POLICY_RETRIEVED_AT });
    }
  });

  test("every quote has text and a code.claude.com source", () => {
    for (const quote of ClaudePolicy.Quotes) {
      expect(quote.text.length).toBeGreaterThan(0);
      expect(quote.source.startsWith("https://code.claude.com/")).toBe(true);
    }
  });

  test("retrievedAt is a calendar date", () => {
    expect(CLAUDE_POLICY_RETRIEVED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("the quotes include the carve-out and the sentence before it", () => {
    expect(quoteTexts().length).toBeGreaterThanOrEqual(5);
    expect(quoteTexts().some((text) => text.startsWith("This does not restrict how customers provision"))).toBe(true);
    expect(quoteTexts().some((text) => text.startsWith("Nor does it prevent an end user from signing in to the unmodified Claude Code binary"))).toBe(true);
  });

  test("distinctive phrases from the supplied quotes are present", () => {
    const joined = quoteTexts().join("\n");
    expect(joined).toContain("third party developers");
    expect(joined).toContain("Anthropic reserves the right");
  });
});
