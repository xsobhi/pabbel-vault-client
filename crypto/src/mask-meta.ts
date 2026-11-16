import { decryptJson, encryptJson } from "./aead";
import { aad } from "./keys";

/**
 * What an email mask is for - a label, the site it was given to - sealed on
 * the device under the owner's PERSONAL vault key, with the mask id in the
 * AAD so the server cannot move one mask's meta onto another
 * (docs/crypto.md "Email masks"). The server keeps only the blob.
 * Shared by the web vault and the extension, so both seal the same way.
 */
export interface MaskMeta { label?: string; site?: string }

export const MASK_LABEL_MAX = 64;
// Control and format characters (bidi overrides included) never belong in a label someone reads back.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/** Trimmed, single-spaced, cut at whole characters; empty fields dropped. */
export function tidyMaskMeta(meta: MaskMeta): MaskMeta {
  const out: MaskMeta = {};
  const label = (meta.label ?? "").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  if (label) out.label = Array.from(label).slice(0, MASK_LABEL_MAX).join("");
  const site = (meta.site ?? "").trim().toLowerCase().slice(0, 253);
  if (site) out.site = site;
  return out;
}

/** The blob to store, or null when there is nothing to say (a mask without meta is fine). */
export async function sealMaskMeta(personalKey: CryptoKey, maskId: string, meta: MaskMeta): Promise<string | null> {
  const tidy = tidyMaskMeta(meta);
  if (!tidy.label && !tidy.site) return null;
  return encryptJson(personalKey, tidy, aad.mask(maskId));
}

/** The meta back, {} for none, or `broken` when it does not open (wrong key, or moved from another mask). */
export async function openMaskMeta(personalKey: CryptoKey, maskId: string, blob: string | null): Promise<MaskMeta & { broken?: true }> {
  if (!blob) return {};
  try {
    return tidyMaskMeta(await decryptJson<MaskMeta>(personalKey, blob, aad.mask(maskId)));
  } catch {
    return { broken: true };
  }
}
