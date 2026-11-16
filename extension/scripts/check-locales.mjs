// Locale parity: every _locales/<code>/messages.json has exactly English's keys,
// each message keeps its $PLACEHOLDER$s and declares them, the store limits hold
// (name <= 45, description <= 132), and the file is not silently English.
//   node scripts/check-locales.mjs            -> all locales
//   node scripts/check-locales.mjs de pt_BR   -> just these
import { existsSync, readFileSync, readdirSync } from "node:fs";

export const LOCALES = ["ar", "bn", "cs", "de", "el", "es", "fa", "fil", "fr", "hi", "id", "it", "ja", "ko", "ms", "nl", "pl", "pt_BR",
  "ro", "ru", "sv", "sw", "ta", "th", "tr", "uk", "ur", "vi", "zh_CN", "zh_TW"];
const ROOT = new URL("../", import.meta.url);
const BRAND = new Set(["extShortName", "brandShort", "brandPabbel", "brandVault", "fieldSecretPlaceholder"]);
const read = (code) => JSON.parse(readFileSync(new URL(`_locales/${code}/messages.json`, ROOT), "utf8"));
const holders = (s) => [...s.matchAll(/\$([A-Z0-9_]+)\$/gi)].map((m) => m[1].toLowerCase()).sort();

export function checkLocale(code, en = read("en")) {
  const errs = [];
  if (!existsSync(new URL(`_locales/${code}/messages.json`, ROOT))) return [`${code}: missing messages.json`];
  let m;
  try { m = read(code); } catch (e) { return [`${code}: invalid JSON (${e.message})`]; }
  for (const k of Object.keys(en)) if (!(k in m)) errs.push(`${code}: missing key ${k}`);
  for (const k of Object.keys(m)) if (!(k in en)) errs.push(`${code}: extra key ${k}`);
  let same = 0, total = 0;
  for (const [k, e] of Object.entries(en)) {
    const t = m[k];
    if (!t) continue;
    if (typeof t.message !== "string" || !t.message.trim()) { errs.push(`${code}: ${k} has no message`); continue; }
    const want = holders(e.message), got = holders(t.message);
    if (want.join() !== got.join()) errs.push(`${code}: ${k} placeholders ${got} != ${want}`);
    for (const p of want) if (!t.placeholders?.[p]?.content) errs.push(`${code}: ${k} does not declare placeholder ${p}`);
    if (!BRAND.has(k)) { total++; if (t.message === e.message) same++; }
  }
  if (m.extName?.message.length > 45) errs.push(`${code}: extName is ${m.extName.message.length} chars (max 45)`);
  if (m.extDescription?.message.length > 132) errs.push(`${code}: extDescription is ${m.extDescription.message.length} chars (max 132)`);
  if (!/Pabbel/.test(m.extName?.message ?? "")) errs.push(`${code}: extName lost the brand`);
  // Filipino code-switches heavily (Google's own fil UI keeps many English words); everyone else must really translate.
  const limit = code === "fil" ? 0.25 : 0.08;
  if (total && same / total > limit) errs.push(`${code}: ${same}/${total} messages identical to English (limit ${Math.round(limit * 100)}%)`);
  return errs;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const codes = process.argv.slice(2).length ? process.argv.slice(2) : LOCALES;
  const present = readdirSync(new URL("_locales/", ROOT));
  const errs = codes.flatMap((c) => checkLocale(c));
  if (!process.argv.slice(2).length) for (const c of LOCALES) if (!present.includes(c)) errs.push(`${c}: not present`);
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
  console.log(`locales OK: ${codes.join(", ")}`);
}
