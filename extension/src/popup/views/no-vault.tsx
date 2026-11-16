import { t } from "../../shared/i18n";
import type { StateView } from "../../shared/messages";
import { WEB_VAULT_URL } from "../../config";
import { api } from "../api";
import { VaultMark } from "../components/icon";

/** Signed in, but this account has never set up Vault: setup lives on the web, where the password warning is. */
export function NoVault({ state, onState }: { state: StateView; onState: (s: StateView) => void }) {
  return (
    <main class="gate">
      <div class="gate-mark"><VaultMark size={56} /></div>
      <h1 class="display">{t("noVaultTitle")}</h1>
      <p class="lede">{t("noVaultBody", state.account?.email ?? "")}</p>
      <a class="btn btn-primary btn-wide" href={WEB_VAULT_URL} target="_blank" rel="noreferrer">{t("actionSetUpOnWeb")}</a>
      <button type="button" class="btn btn-quiet" onClick={async () => onState(await api.signOut())}>{t("actionSwitchAccount")}</button>
    </main>
  );
}
