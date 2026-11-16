// Build one target into its own folder, and zip it.
//
//   node scripts/build.mjs --store     -> dist/ + pabbel-vault-extension-<v>.zip   (the Chrome Web Store package)
//   node scripts/build.mjs --firefox   -> dist-firefox/ + pabbel-vault-firefox-<v>.zip   (the Firefox add-on)
//   node scripts/build.mjs --local     -> dist-local/   (the store build plus the manifest `key`, for loading unpacked)
//
// Deterministic: same sources + same lockfile = same bytes (esbuild output has
// no timestamps or absolute paths; the zips use fixed dates and sorted entries).
// --local differs from --store in manifest.json only: it pins the extension id to the
// store's, because "Sign in with Pabbel" only accepts that id's redirect address.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { manifestFor } from "./manifest.mjs";
import { listFiles, writeZip } from "./zip.mjs";
import { checkStore } from "./check-store.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
const args = new Set(process.argv.slice(2));
const target = args.has("--firefox") ? "firefox" : "chrome";
const local = args.has("--local");
if (!local && !args.has("--store") && target === "chrome") {
  console.error("usage: node scripts/build.mjs --store | --firefox | --local");
  process.exit(2);
}
const out = `${ROOT}${local ? "dist-local" : target === "firefox" ? "dist-firefox" : "dist"}`;

const entries = {
  background: "src/background/index.ts",
  content: "src/content/index.ts",
  popup: "src/popup/main.tsx",
  options: "src/options/main.tsx",
  ...(target === "chrome" ? { offscreen: "src/offscreen/offscreen.ts" } : {}),
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  absWorkingDir: ROOT,
  entryPoints: entries,
  outdir: out,
  bundle: true,
  format: "iife",
  target: ["chrome120", "firefox128"],
  platform: "browser",
  charset: "utf8",
  legalComments: "none",
  minifySyntax: true,
  treeShaking: true,
  sourcemap: false,
  tsconfig: "tsconfig.json",
  jsx: "automatic",
  jsxImportSource: "preact",
  loader: { ".dat": "text" },
  alias: { "@vault/crypto": `${ROOT}../crypto/src` },
  define: {
    __PV_TARGET__: JSON.stringify(target),
    __PV_VERSION__: JSON.stringify(pkg.version),
  },
  logLevel: "warning",
});

for (const page of ["popup.html", "options.html", ...(target === "chrome" ? ["offscreen.html"] : [])]) cpSync(`${ROOT}static/${page}`, `${out}/${page}`);
for (const dir of ["styles", "fonts", "icons", "licenses"]) cpSync(`${ROOT}static/${dir}`, `${out}/${dir}`, { recursive: true });
cpSync(`${ROOT}_locales`, `${out}/_locales`, { recursive: true });
writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifestFor({ target, local, version: pkg.version }), null, 2)}\n`);

if (!local) {
  checkStore(out, target);
  const name = target === "firefox" ? `pabbel-vault-firefox-${pkg.version}.zip` : `pabbel-vault-extension-${pkg.version}.zip`;
  writeZip(`${ROOT}${name}`, listFiles(out));
  console.log(`built ${out} and ${name}`);
} else {
  console.log(`built ${out} (local: pinned extension id)`);
}
