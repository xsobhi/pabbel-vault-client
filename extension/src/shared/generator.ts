/**
 * The password generator, shared with the web vault: same alphabet
 * (no l/1/O/0), every enabled class at least once, crypto.getRandomValues.
 */
import { generatePassword, type GeneratorOptions } from "@vault/crypto/generator";

export { generatePassword, type GeneratorOptions };

export const DEFAULT_GENERATOR: Required<GeneratorOptions> = { length: 20, uppercase: true, numbers: true, symbols: true };
export const GENERATOR_MIN = 8;
export const GENERATOR_MAX = 64;

/** Rough entropy in bits, for the strength label under the generated password. */
export function generatorBits(o: Required<GeneratorOptions>): number {
  let pool = 25;
  if (o.uppercase) pool += 24;
  if (o.numbers) pool += 8;
  if (o.symbols) pool += 13;
  return Math.round(o.length * Math.log2(pool));
}
