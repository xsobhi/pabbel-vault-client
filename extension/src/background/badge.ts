/**
 * The toolbar badge: how many saved logins match the active tab, shown only
 * while the vault is unlocked. Counting uses the in-memory index (or the
 * session cache after a worker restart) and never goes to the network.
 */
import { matchesFor } from "../shared/match";
import { siteOf } from "../shared/site";
import { t } from "../shared/i18n";
import { cachedItems } from "./data";
import { getKeys } from "./session";

const ACCENT = "#e0612a";

export async function badgeFor(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  const unlocked = !!(await getKeys());
  let text = "";
  if (unlocked) {
    const page = siteOf(tab.url);
    if (page?.secure) {
      const n = matchesFor(await cachedItems(), page).logins.length;
      text = n ? (n > 99 ? "99+" : String(n)) : "";
    }
  }
  await chrome.action.setBadgeText({ tabId: tab.id, text }).catch(() => {});
  await chrome.action.setTitle({ tabId: tab.id, title: unlocked ? t("brandShort") : `${t("brandShort")} - ${t("stateLocked")}` }).catch(() => {});
}

export async function refreshBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true });
  await Promise.all(tabs.map((tab) => badgeFor(tab)));
}

export function initBadge(): void {
  void chrome.action.setBadgeBackgroundColor({ color: ACCENT });
  void chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void chrome.tabs.get(tabId).then(badgeFor).catch(() => {});
  });
  chrome.tabs.onUpdated.addListener((_id, change, tab) => {
    if (change.url || change.status === "complete") void badgeFor(tab);
  });
  chrome.windows.onFocusChanged.addListener(() => void refreshBadges());
}
