/**
 * The two vault-key settings: trusting this browser, and a new vault
 * password. Both run in the worker (trust.ts, password.ts); this page only
 * asks and shows the answer.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { t, uiLanguage } from "../shared/i18n";
import type { StateView } from "../shared/messages";
import { api } from "../popup/api";

const untilText = (ms: number) => new Intl.DateTimeFormat(uiLanguage(), { dateStyle: "long" }).format(new Date(ms));

/** "Stay unlocked on this browser": turning it on needs the vault open (the master key is what gets wrapped); off works any time. */
export function StayUnlockedRow({ st, onState }: { st: StateView; onState: (s: StateView) => void }) {
  const [busy, setBusy] = useState(false);
  const on = !!st.trust?.on;
  const canTurnOn = st.vault === "unlocked";
  const flip = async (next: boolean) => {
    setBusy(true);
    try { onState(await api.trust(next)); } catch { onState(await api.state(true)); } finally { setBusy(false); }
  };
  return (
    <label class="opt-row">
      <span><b>{t("optionsStay")}</b><small>{t("optionsStayHint")}</small>
        {on && st.trust?.until ? <small>{t("optionsStayUntil", untilText(st.trust.until))}</small> : !canTurnOn && <small>{t("optionsStayLocked")}</small>}
      </span>
      <input type="checkbox" role="switch" checked={on} disabled={busy || (!on && !canTurnOn)} onChange={(e) => void flip((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

/** A new vault password without the old one: whoever has the vault open can already read all of it. */
export function PasswordRow() {
  const [open, setOpen] = useState(() => location.hash === "#password");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { first.current?.focus(); first.current?.scrollIntoView({ block: "center" }); } }, [open]);

  async function submit(e: Event) {
    e.preventDefault();
    if (pw.length < 12) return setMsg({ error: true, text: t("passwordTooShort") });
    if (pw !== confirm) return setMsg({ error: true, text: t("passwordMismatch") });
    setBusy(true); setMsg(null);
    try {
      const res = await api.changePassword(pw);
      if (!res.ok) {
        setMsg({ error: true, text: res.error === "too-short" ? t("passwordTooShort") : res.error === "stale" ? t("errorStaleSession") : t("errorPassword") });
        return;
      }
      setPw(""); setConfirm(""); setOpen(false);
      setMsg({ error: false, text: res.trustFailed ? `${t("passwordChanged")} ${t("errorTrust")}` : t("passwordChanged") });
    } catch { setMsg({ error: true, text: t("errorPassword") }); }
    finally { setBusy(false); }
  }

  return (
    <div id="password">
      <div class="opt-row"><span><b>{t("optionsPassword")}</b><small>{t("optionsPasswordHint")}</small></span>
        {!open && <button type="button" class="btn btn-quiet" onClick={() => { setOpen(true); setMsg(null); }}>{t("actionChangePassword")}</button>}</div>
      {msg && <p class={msg.error ? "error" : "pad"} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
      {open && (
        <form class="opt-form" onSubmit={submit}>
          <label><span class="hint">{t("passwordNew")}</span><input ref={first} type="password" autocomplete="new-password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} /></label>
          <label><span class="hint">{t("passwordConfirm")}</span><input type="password" autocomplete="new-password" value={confirm} onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} /></label>
          <span class="opt-actions">
            <button type="button" class="btn btn-quiet" disabled={busy} onClick={() => { setOpen(false); setPw(""); setConfirm(""); setMsg(null); }}>{t("actionCancel")}</button>
            <button type="submit" class="btn btn-primary" disabled={busy || !pw || !confirm}>{busy ? t("passwordWorking") : t("actionChangePassword")}</button>
          </span>
        </form>
      )}
    </div>
  );
}
