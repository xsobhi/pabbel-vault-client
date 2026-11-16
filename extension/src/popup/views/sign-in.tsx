import { useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import type { StateView } from "../../shared/messages";
import { PRIVACY_URL } from "../../config";
import { api } from "../api";
import { PabbelMark, VaultMark } from "../components/icon";

/** Signed out: one button, and it opens Pabbel's own sign-in page - no password is typed here. */
export function SignIn({ onState }: { onState: (s: StateView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    try { onState(await api.signIn()); }
    catch (e) { setError((e as Error).message.includes("closed") || (e as Error).message.includes("did not approve") ? null : t("errorSignIn")); }
    finally { setBusy(false); }
  }
  return (
    <main class="gate">
      <div class="gate-mark"><span class="postmark" aria-hidden="true" /><VaultMark size={64} /></div>
      <p class="eyebrow">{t("brandShort")}</p>
      <h1 class="display">{t("signInTitle")}</h1>
      <p class="lede">{t("signInBody")}</p>
      {error && <p class="error" role="alert">{error}</p>}
      <button type="button" class="btn btn-primary btn-wide" onClick={go} disabled={busy}>
        <PabbelMark size={20} class="btn-mark" />
        {busy ? t("signInWaiting") : t("actionSignInWithPabbel")}
      </button>
      <p class="fine">{t("signInFine")} <a href={PRIVACY_URL} target="_blank" rel="noreferrer">{t("linkPrivacy")}</a></p>
    </main>
  );
}
