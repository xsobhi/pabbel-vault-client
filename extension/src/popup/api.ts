/** The popup's calls to the worker, typed. Every one goes through router.ts's trusted branch. */
import { send } from "../shared/bridge";
import type { ChangePasswordResult, DataView, Settings, StateView, UnlockResult } from "../shared/messages";
import type { Item, ItemData, ItemSummary } from "../shared/items";
import type { GeneratorOptions } from "../shared/generator";

export const api = {
  state: (peek = false) => send<StateView>({ type: "state", peek }),
  signIn: () => send<StateView>({ type: "signIn" }),
  signOut: () => send<StateView>({ type: "signOut" }),
  unlock: (password: string, trust?: boolean) => send<UnlockResult>({ type: "unlock", password, trust }),
  trust: (on: boolean) => send<StateView>({ type: "trust", on }),
  changePassword: (password: string) => send<ChangePasswordResult>({ type: "changePassword", password }),
  lock: () => send<StateView>({ type: "lock" }),
  data: (refresh = false) => send<DataView>({ type: "data", refresh }),
  item: (id: string) => send<Item>({ type: "item", id }),
  save: (vaultId: string, data: ItemData, id?: string) => send<ItemSummary>({ type: "save", vaultId, data, id }),
  remove: (id: string) => send<boolean>({ type: "delete", id }),
  pin: (id: string) => send<ItemSummary>({ type: "pin", id }),
  audit: (id: string, what: "reveal" | "copy" | "code") => send<boolean>({ type: "audit", id, what }),
  copied: () => send<boolean>({ type: "copied" }),
  generate: (options?: GeneratorOptions) => send<string>({ type: "generate", options }),
  settings: () => send<Settings>({ type: "settings" }),
  setSettings: (patch: Partial<Settings>) => send<Settings>({ type: "setSettings", patch }),
  neverList: () => send<string[]>({ type: "neverList" }),
  neverRemove: (site: string) => send<string[]>({ type: "neverRemove", site }),
  fillTab: (id: string) => send<boolean>({ type: "fillTab", id }),
  activity: () => send<boolean>({ type: "activity" }),
  maskState: (address: string) => send<"active" | "paused" | null>({ type: "maskState", address }),
};

/** Copy from the popup, then let the worker blank the clipboard 45 s later. */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  await api.copied();
}
