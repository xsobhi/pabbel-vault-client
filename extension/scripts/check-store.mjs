// Refuse to produce a store package that carries the pinned `key` or any
// remote code: no http(s) script/module loading, no eval-like constructs in
// the bundles.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REMOTE_CODE = [/\bimportScripts\s*\(/, /\bnew Function\s*\(/, /\beval\s*\(/, /import\(\s*["'`]https?:/, /<script[^>]+src=["']https?:/i];

export function checkStore(dir, target) {
  const problems = [];
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  if ("key" in manifest) problems.push("manifest.json carries `key` - the store build must not pin an id");
  if (target === "chrome" && manifest.browser_specific_settings) problems.push("chrome manifest has browser_specific_settings");
  for (const name of readdirSync(dir)) {
    if (!/\.(js|html)$/.test(name)) continue;
    const text = readFileSync(join(dir, name), "utf8");
    for (const re of REMOTE_CODE) if (re.test(text)) problems.push(`${name} matches remote-code pattern ${re}`);
  }
  if (problems.length) {
    console.error(`store check FAILED for ${dir}:\n - ${problems.join("\n - ")}`);
    process.exit(1);
  }
  console.log(`store check passed: ${dir}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  checkStore(process.argv[2] ?? "dist", process.argv[3] ?? "chrome");
}
