import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import type { StateView } from "../../shared/messages";
import { WEB_VAULT_URL } from "../../config";
import { api } from "../api";
import { Icon, VaultMark } from "../components/icon";
import type { Route } from "./home";

/** Wordmark, the two everyday actions (generate, add) and a menu for the rest. */
export function Header({ onRoute, onState, onRefresh }: { onRoute: (r: Route) => void; onState: (s: StateView) => void; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const item = (icon: Parameters<typeof Icon>[0]["name"], label: string, run: () => void) => (
    <button type="button" role="menuitem" class="menu-item" onClick={() => { setOpen(false); run(); }}><Icon name={icon} size={16} />{label}</button>
  );
  return (
    <header class="top">
      <div class="wordmark"><VaultMark size={26} /><span><small>{t("brandPabbel")}</small><b>{t("brandVault")}</b></span></div>
      <div class="top-actions">
        <button type="button" class="icon-btn" onClick={() => onRoute({ name: "generator" })} aria-label={t("generatorTitle")} title={t("generatorTitle")}><Icon name="wand-sparkles" /></button>
        <button type="button" class="icon-btn icon-btn-accent" onClick={() => onRoute({ name: "edit" })} aria-label={t("actionNewItem")} title={t("actionNewItem")}><Icon name="plus" /></button>
        <div class="menu-wrap" ref={menu}>
          <button type="button" class="icon-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={t("actionMore")} title={t("actionMore")}><Icon name="ellipsis-vertical" /></button>
          {open && (
            <div class="menu" role="menu">
              {item("lock", t("actionLock"), async () => onState(await api.lock()))}
              {item("refresh-cw", t("actionSync"), onRefresh)}
              {item("external-link", t("actionOpenWebVault"), () => void chrome.tabs.create({ url: WEB_VAULT_URL }))}
              {item("settings", t("actionSettings"), () => void chrome.runtime.openOptionsPage())}
              {item("key-round", t("menuChangePassword"), () => void chrome.tabs.create({ url: chrome.runtime.getURL("options.html#password") }))}
              <hr />
              {item("arrow-right-left", t("actionSwitchAccount"), async () => onState(await api.signOut()))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
