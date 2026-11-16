/**
 * Icons and marks as real elements - no innerHTML anywhere in the popup or
 * options page. Lucide icons come from the generated node lists (lucide.ts);
 * the two marks are the same artwork as vault.pabbel.com's icon and the P.
 */
import { h } from "preact";
import { LUCIDE, type IconName } from "../../shared/lucide";

export function Icon({ name, size = 18, class: cls = "" }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg class={`ic ${cls}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {LUCIDE[name].map(([tag, attrs], i) => h(tag, { key: i, ...attrs }))}
    </svg>
  );
}

export function VaultMark({ size = 28, class: cls = "" }: { size?: number; class?: string }) {
  return (
    <svg class={cls} width={size} height={size} viewBox="0 0 108 108" aria-hidden="true">
      <rect width="108" height="108" rx="24" fill="#E0612A" />
      <g transform="translate(54 54) scale(1.18) translate(-54 -67)">
        <path fill="#FFFFFF" d="M39,60 V48 a15,15 0 0 1 30,0 V60 h-8 V48 a7,7 0 0 0 -14,0 V60 Z" />
        <path fill="#FFFFFF" d="M36,56 h36 a6,6 0 0 1 6,6 v18 a6,6 0 0 1 -6,6 h-36 a6,6 0 0 1 -6,-6 v-18 a6,6 0 0 1 6,-6 Z" />
        <path fill="#FFD9C4" fill-rule="evenodd" d="M49,64 a5,5 0 1 1 10,0 a5,5 0 1 1 -10,0 Z M51,67.5 h6 l2,9.5 h-10 Z" />
      </g>
    </svg>
  );
}

export function PabbelMark({ size = 20, class: cls = "" }: { size?: number; class?: string }) {
  return (
    <svg class={cls} width={size} height={size} viewBox="0 0 108 108" aria-hidden="true">
      <rect width="108" height="108" rx="24" fill="#E0612A" />
      <g transform="translate(54 54) scale(1.32) translate(-59.5 -54)">
        <path fill="#fff" d="M44,76 L44,32 L60,32 a15,15 0 0 1 0,30 L52,62 L52,76 Z M52,40 L52,54 L59,54 a7,7 0 0 0 0,-14 Z" />
        <circle cx="64" cy="70" r="5" fill="#fff" opacity="0.75" />
      </g>
    </svg>
  );
}
