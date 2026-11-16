/**
 * A live 2-step code with its countdown ring, computed in the popup from the
 * item the worker handed over (RFC 6238, the web vault's own totp module).
 */
import { useEffect, useState } from "preact/hooks";
import { totp } from "@vault/crypto/totp";
import type { TotpData } from "../../shared/items";

export function useTotp(d: TotpData | null): { code: string; left: number; period: number } | null {
  const [now, setNow] = useState(Date.now());
  const [value, setValue] = useState<{ code: string; left: number; period: number } | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!d?.secret) { setValue(null); return; }
    let live = true;
    totp({ secret: d.secret, algorithm: d.algorithm, digits: d.digits, period: d.period }, now)
      .then((r) => { if (live) setValue({ code: r.code, left: r.secondsLeft, period: r.period }); })
      .catch(() => { if (live) setValue(null); });
    return () => { live = false; };
  }, [d?.secret, d?.algorithm, d?.digits, d?.period, Math.floor(now / 1000)]);
  return value;
}

/** "123456" -> "123 456"; 8 digits -> "1234 5678". */
export const groupCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : `${code.slice(0, 3)} ${code.slice(3)}`);

export function TotpRing({ left, period, size = 26 }: { left: number; period: number; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / period));
  return (
    <svg class={`ring ${left <= 5 ? "ring-low" : ""}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle class="ring-track" cx={size / 2} cy={size / 2} r={r} />
      <circle class="ring-arc" cx={size / 2} cy={size / 2} r={r} stroke-dasharray={`${c}`} stroke-dashoffset={`${c * (1 - frac)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">{left}</text>
    </svg>
  );
}
