/** What the popup and the options page can ask the worker for. Trusted callers only (router.ts). */
import { byPinnedThenName, vaultInfo } from "../shared/items";
import { refusedTeams } from "./pins";
import { matchesFor } from "../shared/match";
import { siteOf } from "../shared/site";
import { generatePassword } from "../shared/generator";
import type { DataView, PopupRequest, StateView } from "../shared/messages";
import { account, signIn, signOut } from "./auth";
import { allItems, ensureData, freshItem, isStale, readyData, vaults } from "./data";
import { iconsFor } from "./icons";
import { summaries } from "./item-views";
import { scheduleClipboardClear } from "./clipboard";
import { fillItemInTab } from "./commands";
import { refreshBadges } from "./badge";
import { getKeys, lock, touch } from "./session";
import { getSettings, neverList, removeNever, updateSettings } from "./settings";
import { unlock, vaultState } from "./unlock";
import { createItem, deleteItem, recordRead, togglePin, updateItem } from "./writes";
import { resumePending } from "./save-prompt";
import { forgetThisBrowser, trustThisBrowser, trustView } from "./trust";
import { changeVaultPassword } from "./password";
import { maskState } from "./masks";

async function activeTabUrl(): Promise<{ id?: number; url?: string }> {
  const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return { id: t?.id, url: t?.url };
}

async function dataView(refresh = false): Promise<DataView> {
  await (refresh ? ensureData(true) : readyData());
  await touch();
  const items = allItems();
  const rows = summaries(items).sort(byPinnedThenName);
  const page = siteOf((await activeTabUrl()).url);
  const site = page?.secure ? page : null;
  const m = site ? matchesFor(items, site) : null;
  return {
    vaults: vaults().map(vaultInfo),
    items: rows,
    icons: await iconsFor([...new Set(rows.map((r) => r.iconKey).filter((k): k is string => !!k))]),
    stale: isStale(),
    refused: [...refusedTeams.keys()].map((id) => vaults().find((v) => v.id === id)?.name ?? id),
    site: site ? { host: site.host, site: site.site } : null,
    matches: m ? [...m.logins, ...m.totps].map((i) => i.id) : [],
  };
}

async function state(peek = false): Promise<StateView> {
  const who = await account();
  const vault = await vaultState(!peek);
  return { signedIn: !!who, account: who ? { email: who.email, name: who.name } : null, vault, trust: await trustView() };
}

export async function popupHandler(msg: PopupRequest): Promise<unknown> {
  switch (msg.type) {
    case "state": return state(!!msg.peek);
    case "signIn": await signIn(); return state();
    // The trusted-browser record goes with it (onSigningOut in index.ts).
    case "signOut": await signOut(); return state();
    case "unlock": {
      const res = await unlock(String(msg.password ?? ""), typeof msg.trust === "boolean" ? msg.trust : undefined);
      if (res.ok) { void refreshBadges(); void resumePending(); }
      return res;
    }
    case "lock": await lock(true); return state();
    case "data": return dataView(!!msg.refresh);
    case "item": { const it = await freshItem(msg.id); await touch(); return it; }
    case "save": {
      const it = msg.id ? await updateItem(msg.id, msg.vaultId, msg.data) : await createItem(msg.vaultId, msg.data);
      return summaries([it])[0];
    }
    case "delete": await deleteItem(msg.id); return true;
    case "pin": return summaries([await togglePin(msg.id)])[0];
    case "audit": recordRead(msg.id, msg.what); return true;
    case "copied": await scheduleClipboardClear(); await touch(); return true;
    case "generate": return generatePassword({ ...(await getSettings()).generator, ...(msg.options ?? {}) });
    case "settings": return getSettings();
    case "setSettings": return updateSettings(msg.patch ?? {});
    case "neverList": return neverList();
    case "neverRemove": return removeNever(String(msg.site));
    case "fillTab": {
      const tab = await activeTabUrl();
      return tab.id === undefined ? false : fillItemInTab(msg.id, tab.id);
    }
    case "activity": await touch(); return true;
    case "trust": await (msg.on ? trustThisBrowser() : forgetThisBrowser()); return state();
    case "changePassword": return changeVaultPassword(String(msg.password ?? ""));
    case "maskState": return (await getKeys()) ? maskState(String(msg.address ?? "")) : null;
  }
}
