export function unfenced(markdown: string): string {
  const trimmed = markdown.trim();
  const lines = trimmed.split("\n");
  if (lines.length >= 2 && (lines[0] ?? "").startsWith("```") && (lines.at(-1) ?? "") === "```") {
    return lines.slice(1, -1).join("\n").trim();
  }
  return trimmed;
}

export function fitBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text) <= maxBytes) {
    return text;
  }
  const lines = text.split("\n");
  let used = 0;
  let from = lines.length;
  while (from > 0) {
    const need = Buffer.byteLength(lines[from - 1] ?? "") + (used > 0 ? 1 : 0);
    if (used + need > maxBytes) {
      break;
    }
    used += need;
    from -= 1;
  }
  const kept = lines.slice(from).join("\n");
  if (kept !== "") {
    return kept;
  }
  const chars = Array.from(lines.at(-1) ?? "");
  while (chars.length > 0 && Buffer.byteLength(chars.join("")) > maxBytes) {
    chars.splice(0, Math.max(1, Math.ceil(chars.length / 20)));
  }
  return chars.join("");
}
