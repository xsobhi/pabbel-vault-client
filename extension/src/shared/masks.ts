/**
 * Email masks as the extension sees them. The server owns them (the API's /vault/masks);
 * the domains are repeated here only so the popup knows which usernames are
 * worth asking about - an address on any other domain is never a mask.
 */
export const MASK_DOMAINS: readonly string[] = ["fennda.com", "fennda.net"];

export function isMaskAddress(value: string): boolean {
  const at = value.lastIndexOf("@");
  return at > 0 && MASK_DOMAINS.includes(value.slice(at + 1).trim().toLowerCase());
}

/** A mask row in the in-page dropdown: an address made for this site before. */
export interface InlineMask { id: string; address: string }

/** What "Use a new email mask" comes back with. */
export type NewMaskReply = { address: string } | { error: "rate" | "failed" };
