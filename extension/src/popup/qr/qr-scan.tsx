/** "Scan, paste or upload a QR code" for the 2-step form. The picture is read here, on the device; only the chosen account reaches the form. */
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import { interpretQr, isDefaultParams } from "../../shared/otp-qr";
import type { ParsedOtpauth } from "@vault/crypto/totp";
import { blobToDataUrl, captureTab, clipboardImage, decodeDataUrl } from "./image";

const label = (p: ParsedOtpauth) => [p.issuer, p.account].filter(Boolean).join(" · ") || "?";
const details = (p: ParsedOtpauth) => (isDefaultParams(p) ? "" : t("qrDetails", [p.algorithm ?? "SHA1", p.digits ?? 6, p.period ?? 30]));

export function QrScan({ onPick }: { onPick: (p: ParsedOtpauth) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<ParsedOtpauth[]>([]);
  const [picked, setPicked] = useState<ParsedOtpauth | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const run = useRef<(source: () => Promise<string | null>, failure?: string) => Promise<void>>();

  run.current = async (source, failure = t("qrNone")) => {
    if (busy) return;
    setBusy(true); setError(null); setChoices([]); setPicked(null);
    try {
      const url = await source();
      const out = interpretQr(url ? await decodeDataUrl(url) : []);
      if (!out.ok) setError(out.reason === "notOtp" ? t("qrNotOtp") : t("qrNone"));
      else if (out.accounts.length === 1) { setPicked(out.accounts[0]); onPick(out.accounts[0]); }
      else setChoices(out.accounts);
    } catch { setError(failure); }
    setBusy(false);
  };
  const go = (source: () => Promise<string | null>, failure?: string) => run.current!(source, failure);
  const fromBlob = (b: Blob) => go(() => blobToDataUrl(b));

  // Ctrl+V anywhere in the form: only a pasted image is taken; pasting text into a field is left alone.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (img) { e.preventDefault(); fromBlob(img); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div class="qr-scan">
      <div class="qr-actions">
        <button type="button" class="btn btn-quiet" disabled={busy} onClick={() => go(captureTab, t("qrCaptureFail"))}>{t("qrScanPage")}</button>
        <button type="button" class="btn btn-quiet" disabled={busy} onClick={() => go(async () => { const b = await clipboardImage(); if (!b) throw new Error("empty"); return blobToDataUrl(b); }, t("qrNoClip"))}>{t("qrPaste")}</button>
        <button type="button" class="btn btn-quiet" disabled={busy} onClick={() => file.current?.click()}>{t("qrUpload")}</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ""; if (f) fromBlob(f); }} />
      </div>
      <small class="hint">{t("qrHint")}</small>
      {error && <p class="error" role="alert">{error}</p>}
      {choices.length > 0 && (
        <div class="qr-choices" role="group" aria-label={t("qrPick")}>
          <small class="hint">{t("qrPick")}</small>
          {choices.map((p) => (
            <button type="button" class="btn btn-quiet" onClick={() => { setPicked(p); setChoices([]); onPick(p); }}>{label(p)}{details(p) && <small class="hint"> {details(p)}</small>}</button>
          ))}
        </div>
      )}
      {picked && <p class="qr-picked" role="status">{t("qrScanned", label(picked))}{details(picked) && <small class="hint"> {details(picked)}</small>}</p>}
    </div>
  );
}
