// Compare two unpacked extension folders, file by file - for example your own
// build (dist/ or dist-firefox/) against the store package, unzipped.
//
//   node scripts/compare.mjs dist /path/to/unpacked-chrome-package
//   node scripts/compare.mjs dist-firefox /path/to/unpacked-firefox-package
//
// Ignored, because the stores add them: Chrome's _metadata/ folder, Firefox's
// META-INF/ signature folder, and the update_url Chrome adds to manifest.json
// (the manifest is otherwise compared as JSON, not as text).
// esbuild writes a "// path/to/module.ts" comment above each bundled module, so
// two builds of the same code from checkouts with different layouts differ in
// those lines only. They are ignored in .js files; everything else must match
// byte for byte. Exit code 1 when any file differs, is missing, or is extra.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PATH_COMMENT = /^[ \t]*\/\/ [^\s]+\.(?:tsx?|jsx?|mjs|dat)\r?\n/gm;

const STORE_ADDED = /^(_metadata|META-INF)\//;
const manifestOf = (buf) => { const m = JSON.parse(buf.toString("utf8")); delete m.update_url; return JSON.stringify(m); };

function list(root, dir = "") {
  return readdirSync(join(root, dir)).flatMap((n) => {
    const rel = dir ? `${dir}/${n}` : n;
    return statSync(join(root, rel)).isDirectory() ? list(root, rel) : [rel];
  }).filter((f) => !STORE_ADDED.test(f));
}

const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error("usage: node scripts/compare.mjs <folder-a> <folder-b>"); process.exit(2); }

const filesA = new Set(list(a)), filesB = new Set(list(b));
let bad = 0, same = 0, pathOnly = 0;
for (const f of [...new Set([...filesA, ...filesB])].sort()) {
  if (!filesA.has(f) || !filesB.has(f)) { console.log(`${filesA.has(f) ? "only in A" : "only in B"}: ${f}`); bad++; continue; }
  const x = readFileSync(join(a, f)), y = readFileSync(join(b, f));
  if (x.equals(y)) { same++; continue; }
  if (f === "manifest.json" && manifestOf(x) === manifestOf(y)) { same++; continue; }
  if (f.endsWith(".js") && x.toString("utf8").replace(PATH_COMMENT, "") === y.toString("utf8").replace(PATH_COMMENT, "")) { pathOnly++; console.log(`same code, different module-path comments: ${f}`); continue; }
  console.log(`DIFFERS: ${f}`); bad++;
}
console.log(`${same} identical, ${pathOnly} identical apart from path comments, ${bad} different`);
process.exit(bad ? 1 : 0);
