import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMasker, lorem, run } from "./mask-captures.ts";

const options = { extras: ["alice", "alice@corp.test"], hostnames: ["buildbox"], privateNames: ["acmeproj", "stateforge"], roots: ["/home/alice/work/secretproj"] };
const OFFSET = 1000;

const mask = (value: unknown, key = "") => createMasker(options).maskJsonValue(value, key, OFFSET);

describe("paths and identities", () => {
  test("home paths are rewritten and project roots become proj-n", () => {
    const out = mask({ cwd: "/home/alice/work/secretproj/src", file_path: "/home/alice/work/secretproj/src/a.ts", other: "/Users/bob/thing/x" }) as Record<string, string>;
    expect(out.cwd).toBe("/home/user/proj-1/src");
    expect(out.file_path).toBe("/home/user/proj-1/src/a.ts");
    expect(out.other?.startsWith("/home/user/")).toBe(true);
  });

  test("dotfile directories under home are kept", () => {
    expect(mask("/home/alice/.claude/projects/src", "path")).toBe("/home/user/.claude/projects/src");
  });

  test("encoded project directory names follow the path mapping", () => {
    expect(mask("-home-alice-work-secretproj", "dir")).toBe("-home-user-proj-1");
  });

  test("user name, host name and emails are replaced", () => {
    const out = mask({ a: "alice on buildbox", b: "bob@corp.test", c: "alice@corp.test" }) as Record<string, string>;
    expect(out).toEqual({ a: "user on host", b: "user@example.com", c: "user@example.com" });
  });

  test("private project names are replaced but the public org is kept", () => {
    const out = mask({ a: "see StateForge docs", b: "stateforge-labs/harness-kit" }) as Record<string, string>;
    expect(out.a).toBe("see proj docs");
    expect(out.b).toBe("stateforge-labs/harness-kit");
  });

  test("private urls are replaced and public hosts are kept", () => {
    const out = mask({ a: "https://gitlab.corp.test/team/repo", b: "https://api.anthropic.com/v1" }) as Record<string, string>;
    expect(out.a).toMatch(/^https:\/\/example\.com\/repo-1$/);
    expect(out.b).toBe("https://api.anthropic.com/v1");
  });
});

describe("secrets", () => {
  test("tokens and keys are redacted", () => {
    const out = mask({ a: "sk-abcdefghijklmnopqrstuv", b: "ghp_abcdefghijklmnopqrstuv", c: "glpat-abcdefghij", d: "AKIAABCDEFGHIJKLMNOP", e: "Bearer abc.def" }) as Record<string, string>;
    expect(out).toEqual({ a: "REDACTED", b: "REDACTED", c: "REDACTED", d: "REDACTED", e: "Bearer REDACTED" });
  });

  test("signature and encrypted content are redacted", () => {
    const out = mask({ signature: "x".repeat(40), encrypted_content: "y".repeat(40) }) as Record<string, string>;
    expect(out.signature).toBe("REDACTED");
    expect(out.encrypted_content).toBe("REDACTED");
  });

  test("long blobs under secret-like keys are redacted", () => {
    expect(mask({ api_key: "a".repeat(40) })).toEqual({ api_key: "REDACTED" });
  });

  test("a leaky output is detected by the leak check", () => {
    const masker = createMasker(options);
    expect(masker.leaks("/home/alice/x")).toContain("home path");
    expect(masker.leaks("mail me at someone@corp.test")).toContain("email");
    expect(masker.leaks("sk-abcdefghijklmnop")).toContain("sk key");
    expect(masker.leaks("ALICE")).toContain("identity");
    expect(masker.leaks("buildbox")).toContain("hostname");
    expect(masker.leaks("task-notification and /home/user/proj-1")).toEqual([]);
    expect(masker.leaks("/home/user/.cache/claude-tmp/claude-4242/x")).toEqual(expect.arrayContaining(["temp directory", "uid directory"]));
    expect(masker.leaks("Linux 5.9.9-3-custom")).toContain("kernel build");
    expect(masker.leaks("You've used 12% of your weekly limit")).toContain("account usage");
    expect(masker.leaks("resets Dec 3, 9pm")).toContain("reset time");
    expect(masker.leaks("cwd ~/Secret")).toContain("home-relative path");
    expect(masker.leaks("/home/user/proj-7/secret.worktrees/x/y.ts")).toContain("path tail");
    expect(masker.leaks("/home/user/proj-7/src/lorem-ipsum/dolor.ts")).toEqual([]);
    expect(masker.leaks("session 9a8b7c6d\u2026/scratchpad")).toContain("session id fragment");
    expect(masker.leaks("9a8b7c6d-1234-5678")).toContain("uuid fragment");
    expect(masker.leaks("host 10.4.5.6")).toContain("ip address");
    expect(masker.leaks("see the acmeproj docs")).toContain("private project name");
    expect(masker.leaks("claude-0 Linux 6.0.0-0-example 00000000\u2026 ~/lorem-ipsum 192.0.2.1 stateforge-labs/x claude-opus-4-5")).toEqual([]);
  });

  test("the masker removes every class the leak check flags", () => {
    const masker = createMasker(options);
    const samples = [
      "/home/alice/.cache/claude-tmp/claude-4242/-home-alice-work-secretproj/scratchpad/x",
      "Linux 5.9.9-3-custom x86_64",
      "You've used 12% of your weekly limit \u00b7 resets Dec 3, 9pm  \u00b7 more",
      "in ~/Secret and ~/.cache/foo/bar",
      "/home/alice/work/secretproj/secret.worktrees/switch/apps/tool/bin/run-it.sh",
      "id 9a8b7c6d\u2026/scratchpad and 9a8b7c6d-1234-5678",
      "ip 10.4.5.6 and acmeproj-thing",
    ];
    for (const sample of samples) expect(masker.leaks(masker.maskName(sample, OFFSET))).toEqual([]);
  });
});

describe("temp directories, usage lines, kernel, fragments and path tails", () => {
  const text = (s: string): string => createMasker(options).maskText(s, OFFSET);

  test("the temp directory and uid directory are removed", () => {
    const out = text("/home/alice/.cache/claude-tmp/claude-4242/-home-alice-work-secretproj/abc/scratchpad");
    expect(out).not.toMatch(/claude-tmp|4242|secretproj/);
    expect(out.startsWith("/home/user/.cache/tmp/")).toBe(true);
  });

  test("usage and reset lines keep their length and lose their words", () => {
    const line = "  You've used 12% of your weekly limit \u00b7 resets Dec 3, 9pm  \u00b7 /usage-credits to keep going \u2026";
    const out = text(line);
    expect(out).not.toMatch(/weekly|12%|resets|Dec/);
    expect(out).toContain("/usage-credits to keep going");
    expect(out.length).toBe(line.length);
  });

  test("the kernel string is normalised", () => {
    expect(text("OS Version: Linux 5.9.9-3-custom")).toBe("OS Version: Linux 6.0.0-0-example");
  });

  test("session fragments and partial uuids become zeros", () => {
    expect(text("a/9a8b7c6d\u2026/b")).toBe("a/00000000\u2026/b");
    expect(text("id 9a8b7c6d-1234-5678 end")).toBe("id 00000000-0000-0000 end");
  });

  test("home-relative directories keep their length", () => {
    const out = text("   ~/Secret   ~/.config/tool/file.toml");
    expect(out).not.toContain("Secret");
    expect(out.indexOf("~/", 4)).toBe("   ~/Secret   ".length);
    expect(out).toContain("~/.config/");
    expect(out).not.toContain("tool");
  });

  test("path tails become lorem segments, keeping depth, generic names and extensions", () => {
    const out = mask({ file_path: "/home/alice/work/secretproj/secret.worktrees/fixture-app/apps/fixture-app/bin/run-secret.sh", other: "/home/alice/work/secretproj/src/Widget.test.ts" }) as Record<string, string>;
    const path = out.file_path ?? "";
    expect(path.startsWith("/home/user/proj-1/")).toBe(true);
    expect(path.split("/").length).toBe("/home/user/proj-1/a/b/apps/c/bin/d.sh".split("/").length);
    expect(path).toContain("/apps/");
    expect(path).toContain("/bin/");
    expect(path.endsWith(".sh")).toBe(true);
    expect(path).not.toMatch(/secret|switch|user\/bin/);
    expect(out.other).toMatch(/^\/home\/user\/proj-1\/src\/[a-z-]+\.ts$/);
    expect(JSON.stringify(mask({ file_path: "/home/alice/work/secretproj/a/b.ts" }))).toBe(JSON.stringify(mask({ file_path: "/home/alice/work/secretproj/a/b.ts" })));
  });

  test("ip addresses, kernel-free public urls and repo urls", () => {
    expect(text("peer 10.4.5.6 and 127.0.0.1")).toBe("peer 192.0.2.1 and 127.0.0.1");
    const out = text("https://github.com/someorg/somerepo/issues/42 https://github.com/anthropics/claude-code");
    expect(out).not.toMatch(/someorg|somerepo/);
    expect(out).toContain("/issues/42");
    expect(out).toContain("https://github.com/anthropics/claude-code");
  });
});

describe("ids, time and text", () => {
  test("uuids and prefixed ids are remapped consistently", () => {
    const masker = createMasker(options);
    const a = masker.maskJsonValue({ id: "0a1b2c3d-1111-2222-3333-444455556666", ref: "0a1b2c3d-1111-2222-3333-444455556666", other: "ses_abcdefghijklmnop" }, "", OFFSET) as Record<string, string>;
    expect(a.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(a.ref).toBe(a.id);
    expect(a.other).toBe("ses_0000000000000001");
  });

  test("timestamps shift by the offset and numbers stay", () => {
    const out = mask({ at: "2026-10-20T10:00:00.000Z", ms: 1_790_000_000_000, tokens: 1234 }) as Record<string, unknown>;
    expect(out.at).toBe("2026-10-20T10:00:01.000Z");
    expect(out.ms).toBe(1_790_000_001_000);
    expect(out.tokens).toBe(1234);
  });

  test("the minimum timestamp is found across nested values", () => {
    const masker = createMasker(options);
    expect(masker.minTimestamp([{ a: "2026-10-20T10:00:00.000Z" }, { b: 1_795_000_000_000 }])).toBe(Date.parse("2026-10-20T10:00:00.000Z"));
  });

  test("free text keeps its length and line structure but loses its words", () => {
    const original = "my secret plan is here\nand continues on this line";
    const out = mask({ text: original }) as { text: string };
    expect(out.text.length).toBe(original.length);
    expect(out.text.split("\n").length).toBe(2);
    expect(out.text).not.toContain("secret");
  });

  test("structural prefixes and wrapper tags survive while prose is replaced", () => {
    const out = mask({
      a: "Error during compaction: the private reason goes here",
      b: "<task-notification><task-id>abc123</task-id><status>completed</status><summary>private words here ok</summary></task-notification>",
      c: "Script running with cell ID 77 and some private output",
    }) as Record<string, string>;
    expect(out.a?.startsWith("Error during compaction")).toBe(true);
    expect(out.a).not.toContain("private");
    expect(out.b).toContain("<task-id>abc123</task-id>");
    expect(out.b).toContain("<status>completed</status>");
    expect(out.b).not.toContain("private");
    expect(out.c?.startsWith("Script running with cell ID cell-1")).toBe(true);
  });

  test("commands are replaced and argv arrays keep their shape", () => {
    const out = mask({ command: "rm -rf /home/alice/secret", cmd: ["bash", "-lc", "cat password.txt"] }) as Record<string, unknown>;
    expect(out.command).toBe("echo lorem");
    expect(out.cmd).toEqual(["bash", "-lc", lorem(12, "cat password.txt")]);
  });

  test("json held in a string is masked as json", () => {
    const out = mask({ arguments: JSON.stringify({ path: "/home/alice/work/secretproj/a.ts", cell_id: "42" }) }) as { arguments: string };
    expect(JSON.parse(out.arguments)).toEqual({ path: "/home/user/proj-1/a.ts", cell_id: "cell-1" });
  });

  test("masking is deterministic", () => {
    const input = { text: "some private words that are long enough", id: "ses_abcdefghijklmnop" };
    expect(JSON.stringify(mask(input))).toBe(JSON.stringify(mask(input)));
  });
});

describe("run", () => {
  const setup = (): { raw: string; out: string } => {
    const base = mkdtempSync(join(tmpdir(), "mask-test-"));
    const raw = join(base, "raw");
    mkdirSync(join(raw, "claude/projects/-home-alice-work-secretproj"), { recursive: true });
    writeFileSync(
      join(raw, "claude/projects/-home-alice-work-secretproj/0a1b2c3d-1111-2222-3333-444455556666.jsonl"),
      `${JSON.stringify({ type: "user", cwd: "/home/alice/work/secretproj", timestamp: "2026-10-20T10:00:00.000Z", message: { role: "user", content: "hello from alice, this is private text" } })}\nnot json\n`,
    );
    writeFileSync(join(raw, "manifest.json"), JSON.stringify({ "claude/projects/-home-alice-work-secretproj/0a1b2c3d-1111-2222-3333-444455556666.jsonl": { source: "local-capture", harnessVersion: "9.9.9", capturedAt: "2026-11-08" } }));
    return { raw, out: join(base, "out") };
  };

  test("writes masked files, provenance and the leak check passes", () => {
    const { raw, out } = setup();
    expect(run(raw, out, ["alice"], false)).toBe(0);
    const file = join(out, "claude/projects/-home-user-proj-1/00000000-0000-4000-8000-000000000001.jsonl");
    const row = JSON.parse(readFileSync(file, "utf8").trim());
    expect(row.cwd).toBe("/home/user/proj-1");
    expect(row.timestamp).toBe("2026-11-01T00:00:00.000Z");
    expect(row.message.content).not.toContain("alice");
    const provenance = JSON.parse(readFileSync(join(out, "claude/provenance.json"), "utf8"));
    const entry = Object.values(provenance)[0] as { source: string; harnessVersion: string; maskedBy: string };
    expect(entry.source).toBe("local-capture");
    expect(entry.harnessVersion).toBe("9.9.9");
    expect(entry.maskedBy.startsWith("tools/mask-captures.ts@")).toBe(true);
    expect(run("", out, ["alice"], true)).toBe(0);
  });

  test("the check fails on a leaky tree", () => {
    const { raw, out } = setup();
    run(raw, out, ["alice"], false);
    writeFileSync(join(out, "claude/leak.txt"), "contact someone@corp.test");
    expect(run("", out, ["alice"], true)).toBe(1);
  });
});
