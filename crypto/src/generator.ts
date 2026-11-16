export interface GeneratorOptions { length?: number; uppercase?: boolean; numbers?: boolean; symbols?: boolean }

/** Every enabled class is present at least once; ambiguous glyphs (l, 1, O, 0) left out. */
export function generatePassword(opts: number | GeneratorOptions = 20): string {
  const o: GeneratorOptions = typeof opts === "number" ? { length: opts } : opts;
  const length = Math.min(128, Math.max(8, o.length ?? 20));
  const sets = ["abcdefghijkmnopqrstuvwxyz"];
  if (o.uppercase ?? true) sets.push("ABCDEFGHJKLMNPQRSTUVWXYZ");
  if (o.numbers ?? true) sets.push("23456789");
  if (o.symbols ?? true) sets.push("!@#$%^&*-_=+?");
  const all = sets.join("");
  const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = sets.map((set) => set[rnd(set.length)]);
  while (chars.length < length) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
