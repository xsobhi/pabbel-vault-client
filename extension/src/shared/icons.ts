/**
 * SVG markup shared by the in-page UI (strings) and the popup. The vault mark
 * is the same artwork as vault.pabbel.com's icon.svg and the Android
 * launcher. Line icons are lucide, generated from the web vault's copy (lucide.ts).
 */
import { LUCIDE, type IconName } from "./lucide";

export const VAULT_MARK = `<svg viewBox="0 0 108 108" aria-hidden="true"><rect width="108" height="108" rx="24" fill="#E0612A"/><g transform="translate(54 54) scale(1.18) translate(-54 -67)"><path fill="#FFFFFF" d="M39,60 V48 a15,15 0 0 1 30,0 V60 h-8 V48 a7,7 0 0 0 -14,0 V60 Z"/><path fill="#FFFFFF" d="M36,56 h36 a6,6 0 0 1 6,6 v18 a6,6 0 0 1 -6,6 h-36 a6,6 0 0 1 -6,-6 v-18 a6,6 0 0 1 6,-6 Z"/><path fill="#FFD9C4" fill-rule="evenodd" d="M49,64 a5,5 0 1 1 10,0 a5,5 0 1 1 -10,0 Z M51,67.5 h6 l2,9.5 h-10 Z"/></g></svg>`;


/** Constant markup for the in-page UI, which builds it element by element (content/dom.ts svg()). */
export function icon(name: IconName): string {
  const body = LUCIDE[name].map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
