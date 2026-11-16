import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import type { StateView } from "../../shared/messages";
import { api } from "../api";
import { Icon, VaultMark } from "../components/icon";
import { toast } from "../components/toast";

/**
 * The vault password, derived into the master key inside the worker; it never
 * goes anywhere else. "Stay unlocked on this browser" is opt-in: ticked only
 * when this browser was trusted before (kept on, or offered again after its
 * 30 days ran out).
 */
export function Unlock({ state, onState, onUnlocked }: { state: StateView; onState: (s: StateView) => void; onUnlocked: () => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const trust = state.trust;
  const [stay, setStay] = useState(!!trust?.on || trust?.ended === "expired");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  async function submit(e: Event) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api.unlock(pw, stay);
      if (res.ok) { setPw(""); if (res.trustFailed) toast(t("errorTrust")); onUnlocked(); return; }
      if (res.error === "wrong-password") { setError(t("errorWrongPassword")); setShake((n) => n + 1); input.current?.select(); }
      else if (res.error === "signed-out") onState(await api.state());
      else if (res.error === "no-vault") onState(await api.state());
      else setError(t("errorUnlock"));
    } catch { setError(t("errorUnlock")); }
    finally { setBusy(false); }
  }

  const who = state.account;
  return (
    <main class="gate">
      <div class={`gate-mark ${busy ? "is-working" : ""}`}><span class="postmark" aria-hidden="true" /><VaultMark size={60} /></div>
      <h1 class="display">{t("unlockTitle")}</h1>
      {trust?.ended && <p class="notice" role="status">{t(trust.ended === "expired" ? "unlockTrustExpired" : "unlockTrustEnded")}</p>}
      <p class="who"><span class="avatar" aria-hidden="true">{(who?.name || who?.email || "?").trim()[0]?.toUpperCase()}</span>{who?.email}</p>
      <form class={`unlock ${shake ? "shake" : ""}`} key={shake} onSubmit={submit}>
        <label class="sr-only" for="vault-password">{t("unlockPasswordLabel")}</label>
        <div class="pw">
          <input ref={input} id="vault-password" type={show ? "text" : "password"} autocomplete="off" spellcheck={false}
            placeholder={t("unlockPasswordLabel")} value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)}
            aria-invalid={!!error} aria-describedby={error ? "unlock-error" : undefined} />
          <button type="button" class="icon-btn" onClick={() => setShow(!show)} aria-label={show ? t("actionHide") : t("actionShow")}>
            <Icon name={show ? "eye-off" : "eye"} size={16} />
          </button>
        </div>
        {error && <p id="unlock-error" class="error" role="alert">{error}</p>}
        <label class="switch stay">
          <input type="checkbox" checked={stay} onChange={(e) => setStay((e.target as HTMLInputElement).checked)} aria-describedby="stay-hint" />
          <span>{t("unlockStay")}</span>
        </label>
        <button type="submit" class={`btn-unlock ${busy ? "is-busy" : ""}`} disabled={busy || !pw}>
          {busy ? <span class="spin" aria-hidden="true" /> : <Icon name={pw ? "lock-open" : "lock"} size={16} />}
          <span>{busy ? t("unlockWorking") : t("actionUnlock")}</span>
        </button>
      </form>
      <p class="fine" id="stay-hint">{stay ? t("unlockStayHint") : t("unlockFine")}</p>
      <button type="button" class="btn btn-quiet" onClick={async () => onState(await api.signOut())}>{t("actionSwitchAccount")}</button>
    </main>
  );
}
