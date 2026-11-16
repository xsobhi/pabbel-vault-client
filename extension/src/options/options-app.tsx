/**
 * Settings: the account, auto-lock, what happens on web pages, the never-save
 * list, and the way to the web vault. Every change is saved at once.
 */
import { useEffect, useState } from "preact/hooks";
import { t } from "../shared/i18n";
import type { Settings, StateView } from "../shared/messages";
import { LOCK_CHOICES, PRIVACY_URL, WEB_VAULT_URL, type LockMinutes } from "../config";
import { api } from "../popup/api";
import { Icon, VaultMark } from "../popup/components/icon";
import { NeverList } from "./never-list";
import { PasswordRow, StayUnlockedRow } from "./security-rows";

const lockLabel = (m: LockMinutes) => (m === 0 ? t("lockOnClose") : m === 1 ? t("lockOneMinute") : t("lockMinutes", String(m)));

export function OptionsApp() {
  const [st, setSt] = useState<StateView | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { void api.state(true).then(setSt); void api.settings().then(setS); }, []);
  const patch = async (p: Partial<Settings>) => setS(await api.setSettings(p));
  const shortcuts = () => void chrome.tabs.create({ url: __PV_TARGET__ === "firefox" ? "about:addons" : "chrome://extensions/shortcuts" });
  const sw = (key: "inlineButton" | "savePrompts" | "copyTotp" | "typeTotp" | "showIcons", title: string, hint: string) => s && (
    <label class="opt-row"><span><b>{title}</b><small>{hint}</small></span>
      <input type="checkbox" role="switch" checked={s[key]} onChange={(e) => void patch({ [key]: (e.target as HTMLInputElement).checked })} /></label>
  );

  return (
    <main class="options">
      <header class="opt-head"><VaultMark size={40} /><div><p class="eyebrow">{t("brandShort")}</p><h1 class="display">{t("optionsTitle")}</h1></div></header>

      <section class="opt-card" aria-labelledby="o-account">
        <h2 id="o-account" class="section"><span>{t("optionsAccount")}</span></h2>
        {st?.signedIn ? (
          <div class="opt-row"><span><b>{st.account?.email}</b><small>{st.vault === "unlocked" ? t("stateUnlocked") : st.vault === "none" ? t("noVaultTitle") : t("stateLocked")}</small></span>
            <span class="opt-actions">
              {st.vault === "unlocked" && <button type="button" class="btn btn-quiet" onClick={async () => setSt(await api.lock())}><Icon name="lock" size={16} />{t("actionLock")}</button>}
              <button type="button" class="btn btn-quiet" onClick={async () => setSt(await api.signOut())}><Icon name="log-out" size={16} />{t("actionSignOut")}</button>
            </span></div>
        ) : (
          <div class="opt-row"><span><b>{t("optionsSignedOut")}</b><small>{t("optionsSignedOutHint")}</small></span>
            <button type="button" class="btn btn-primary" onClick={async () => setSt(await api.signIn())}>{t("actionSignInWithPabbel")}</button></div>
        )}
        <a class="opt-link" href={WEB_VAULT_URL} target="_blank" rel="noreferrer"><Icon name="external-link" size={16} />{t("actionOpenWebVault")}</a>
      </section>

      <section class="opt-card" aria-labelledby="o-security">
        <h2 id="o-security" class="section"><span>{t("optionsSecurity")}</span></h2>
        {s && (
          <label class="opt-row"><span><b>{t("optionsAutoLock")}</b><small>{t("optionsAutoLockHint")}</small></span>
            <select value={String(s.lockMinutes)} onChange={(e) => void patch({ lockMinutes: Number((e.target as HTMLSelectElement).value) as LockMinutes })}>
              {LOCK_CHOICES.map((m) => <option value={String(m)}>{lockLabel(m)}</option>)}
            </select></label>
        )}
        {st?.signedIn && st.vault !== "none" && <StayUnlockedRow st={st} onState={setSt} />}
        {/* Changing it needs the master key, so it is offered only while the vault is open. */}
        {st?.signedIn && st.vault === "unlocked" && <PasswordRow />}
      </section>

      <section class="opt-card" aria-labelledby="o-autofill">
        <h2 id="o-autofill" class="section"><span>{t("optionsAutofill")}</span></h2>
        {sw("inlineButton", t("optionsInline"), t("optionsInlineHint"))}
        {sw("savePrompts", t("optionsSavePrompts"), t("optionsSavePromptsHint"))}
        {sw("copyTotp", t("optionsCopyTotp"), t("optionsCopyTotpHint"))}
        {sw("typeTotp", t("optionsTypeTotp"), t("optionsTypeTotpHint"))}
        {sw("showIcons", t("optionsIcons"), t("optionsIconsHint"))}
        <div class="opt-row"><span><b>{t("optionsShortcut")}</b><small>{t("optionsShortcutHint")}</small></span>
          <button type="button" class="btn btn-quiet" onClick={shortcuts}>{t("actionChangeShortcut")}</button></div>
      </section>

      <NeverList />

      <footer class="opt-foot">
        <span>{t("brandShort")} {__PV_VERSION__}</span>
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer">{t("linkPrivacy")}</a>
      </footer>
    </main>
  );
}
