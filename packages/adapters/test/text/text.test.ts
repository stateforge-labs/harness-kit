import { describe, expect, test } from "bun:test";
import { fitBytes, unfenced } from "../../src/text/index.ts";

describe("fitBytes", () => {
  test("keeps what fits, drops the oldest lines first, and counts bytes not characters", () => {
    expect(fitBytes("a\nb", 10)).toBe("a\nb");
    expect(fitBytes("old\nmid\nnew", 7)).toBe("mid\nnew");
    const accented = Array.from({ length: 100 }, (_, i) => `línea ${i} ñandú`).join("\n");
    const fitted = fitBytes(accented, 500);
    expect(Buffer.byteLength(fitted)).toBeLessThanOrEqual(500);
    expect(fitted.endsWith("línea 99 ñandú")).toBe(true);
  });

  test("one overlong multibyte line loses its head, never a half character", () => {
    const fitted = fitBytes("日本語".repeat(100), 100);
    expect(Buffer.byteLength(fitted)).toBeLessThanOrEqual(100);
    expect(fitted.includes("�")).toBe(false);
    expect(fitBytes("x", 0)).toBe("");
  });
});

describe("unfenced", () => {
  const answer = JSON.stringify({ ops: [{ op: "add", text: "running CI" }, { op: "close", id: "f2" }] });
  const fenced = `\`\`\`json\n${answer}\n\`\`\``;

  test("a bare, a fenced and a padded fenced answer all come back as the bare answer", () => {
    for (const raw of [answer, fenced, `\n\n${fenced}\n`]) expect(unfenced(raw)).toBe(answer);
  });

  test("text without a closing fence is only trimmed", () => {
    expect(unfenced("  ```json\n{}  ")).toBe("```json\n{}");
    expect(unfenced("```")).toBe("```");
  });
});
