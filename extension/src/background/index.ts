/**
 * The background: a service worker in Chrome, an event page in Firefox, the
 * same bundle in both. Every listener is registered synchronously on the
 * first turn, which is what MV3 needs to wake us for an event after the
 * worker was stopped.
 */
import pslText from "../../vendor/public_suffix_list.dat";
import { installPsl } from "../shared/site";
import { handleRefreshAlarm, onSignedOut, onSigningOut } from "./auth";
import { clearAutolock, handleAutolockAlarm, initAutolock } from "./autolock";
import { initBadge, refreshBadges } from "./badge";
import { handleClipboardAlarm } from "./clipboard";
import { forgetData, onDataChange } from "./data";
import { forgetMasks } from "./masks";
import { clearIcons, forgetIcons } from "./icons";
import { forgetTab } from "./frames";
import { buildMenus, initMenus } from "./menus";
import { initRouter } from "./router";
import { forgetStep } from "./next-step";
import { forgetCode } from "./code-step";
import { forgetTabPending } from "./save-prompt";
import { onSettingsChange } from "./settings";
import { lock, onLock } from "./session";
import { lockDownSessionStorage } from "./storage";
import { forgetThisBrowser } from "./trust";
import { migrateTrust } from "./trust-store";

installPsl(pslText);
lockDownSessionStorage();

initRouter();
initBadge();
initMenus();

chrome.alarms.onAlarm.addListener((a) => {
  handleAutolockAlarm(a.name) || handleRefreshAlarm(a.name) || handleClipboardAlarm(a.name);
});

chrome.runtime.onInstalled.addListener(() => buildMenus());
chrome.runtime.onStartup.addListener(() => buildMenus());

chrome.tabs.onRemoved.addListener((tabId) => { forgetTab(tabId); void forgetTabPending(tabId); void forgetStep(tabId); void forgetCode(tabId); });

onLock(() => {
  forgetData();
  forgetIcons();
  forgetMasks();
  void clearAutolock();
  void refreshBadges();
  // Close any open in-page dropdown: it may be showing names from the vault.
  void chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) if (tab.id !== undefined) void chrome.tabs.sendMessage(tab.id, { type: "sw:locked" }).catch(() => {});
  });
});
onSignedOut(() => { void lock(); void clearIcons(); });
// Signed out - by hand, by switching account, or because the refresh token was refused - so this
// browser stops being trusted for that account: a later sign-in must type the vault password again.
onSigningOut((tokenUsable) => forgetThisBrowser(tokenUsable));
void migrateTrust().catch(() => {});
onSettingsChange((s) => { if (!s.showIcons) void clearIcons(); });
onDataChange(() => void refreshBadges());

void initAutolock();
