import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const argRoot = process.argv.indexOf("--root");
const root = resolve(argRoot >= 0 ? process.argv[argRoot + 1]! : join(import.meta.dir, ".."));
const packagesDir = join(root, "packages");

const NODE_ONLY = new Set(["@stateforge-labs/harness-hooks", "@stateforge-labs/harness-adapters"]);
const SHIPPED = ["src", "clients"];

interface Pkg {
  dir: string;
  name: string;
  deps: Set<string>;
  exports: string[];
}

const pkgs: Pkg[] = readdirSync(packagesDir)
  .map((d) => join(packagesDir, d))
  .filter((d) => existsSync(join(d, "package.json")))
  .map((dir) => {
    const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      name: string;
      dependencies?: Record<string, string>;
      exports?: Record<string, string> | string;
    };
    const exp = typeof json.exports === "string" ? ["."] : Object.keys(json.exports ?? {});
    return { dir, name: json.name, deps: new Set(Object.keys(json.dependencies ?? {})), exports: exp };
  });
const byName = new Map(pkgs.map((p) => [p.name, p]));

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((e) => {
    if (e === "node_modules" || e === "dist") return [];
    const p = join(dir, e);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|mts|js|mjs)$/.test(e) ? [p] : [];
  });
}

function specifiers(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of src.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]!);
  return out;
}

function exported(pkg: Pkg, sub: string): boolean {
  return pkg.exports.some((k) => (k.endsWith("/*") ? sub.startsWith(k.slice(0, -1)) : k === sub));
}

const violations: string[] = [];
for (const pkg of pkgs) {
  for (const file of files(pkg.dir)) {
    const rel = relative(root, file);
    const src = readFileSync(file, "utf8");
    for (const spec of specifiers(src)) {
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec);
        if (!(target + sep).startsWith(pkg.dir + sep) && target !== pkg.dir) violations.push(`${rel}: relative import leaves ${pkg.name}: ${spec}`);
        continue;
      }
      const ws = /^(@stateforge-labs\/[^/]+)(\/.*)?$/.exec(spec);
      if (ws) {
        const [, name, rest] = ws;
        if (name === pkg.name) {
          violations.push(`${rel}: imports its own package by name: ${spec}`);
          continue;
        }
        const target = byName.get(name!);
        if (!target) violations.push(`${rel}: unknown workspace package: ${spec}`);
        else if (!pkg.deps.has(name!)) violations.push(`${rel}: ${pkg.name} does not declare ${name}`);
        else if (!exported(target, rest ? `.${rest}` : ".")) violations.push(`${rel}: deep import not in ${name} exports: ${spec}`);
      }
      if (NODE_ONLY.has(pkg.name) && SHIPPED.some((d) => rel.includes(`${sep}${d}${sep}`)) && spec.startsWith("bun")) {
        violations.push(`${rel}: Bun module in shipped library code: ${spec}`);
      }
    }
    if (NODE_ONLY.has(pkg.name) && SHIPPED.some((d) => rel.includes(`${sep}${d}${sep}`)) && /\bBun\.[a-zA-Z]/.test(src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ""))) {
      violations.push(`${rel}: Bun API in shipped library code`);
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  console.error(`${violations.length} boundary violation(s)`);
  process.exit(1);
}
console.log(`boundaries clean: ${pkgs.map((p) => p.name).join(", ")}`);
