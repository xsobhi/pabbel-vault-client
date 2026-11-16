/** Context-menu entries and the keyboard command. Titles are localised; menus are rebuilt on install/startup. */
import { WEB_VAULT_URL } from "../config";
import { t } from "../shared/i18n";
import { fillBest, fillGenerated } from "./commands";
import { lock } from "./session";

const PAGES = ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"];

export function buildMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "pv-fill", title: t("menuFillLogin"), contexts: ["editable"], documentUrlPatterns: PAGES });
    chrome.contextMenus.create({ id: "pv-generate", title: t("menuGenerate"), contexts: ["editable"], documentUrlPatterns: PAGES });
    chrome.contextMenus.create({ id: "pv-lock", title: t("menuLock"), contexts: ["action"] });
    chrome.contextMenus.create({ id: "pv-web", title: t("menuOpenWebVault"), contexts: ["action"] });
  });
}

export function initMenus(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pv-lock") return void lock(true);
    if (info.menuItemId === "pv-web") return void chrome.tabs.create({ url: WEB_VAULT_URL });
    if (tab?.id === undefined) return;
    if (info.menuItemId === "pv-fill") void fillBest(tab.id, info.frameId);
    if (info.menuItemId === "pv-generate") void fillGenerated(tab.id, info.frameId ?? 0);
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== "fill-login") return;
    const go = (id?: number) => { if (id !== undefined) void fillBest(id); };
    if (tab?.id !== undefined) go(tab.id);
    else void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([t0]) => go(t0?.id));
  });
}
