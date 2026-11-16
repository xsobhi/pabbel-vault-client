/**
 * Which frames of which tabs have login, code or new-password fields, and
 * which one the person last focused - so the keyboard shortcut and the
 * context menu know where to fill without broadcasting anything to every frame.
 *
 * Frames are addressed by documentId: if a frame has since navigated, the
 * old documentId no longer exists and a message to it fails instead of
 * landing in whatever document took its place.
 */
import type { FieldKind } from "../shared/messages";
import { getSession, SESSION, setSession } from "./storage";

export interface FrameEntry { frameId: number; documentId?: string; url: string; kinds: FieldKind[]; focusedAt: number }
type Registry = Record<string, Record<string, FrameEntry>>;

let registry: Registry | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function load(): Promise<Registry> {
  registry ??= (await getSession<Registry>(SESSION.frames)) ?? {};
  return registry;
}

function persist(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; void setSession(SESSION.frames, registry ?? {}); }, 500);
}

export async function recordFrame(sender: chrome.runtime.MessageSender, patch: { kinds?: FieldKind[]; focused?: boolean }): Promise<void> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId === undefined || !sender.url) return;
  const reg = await load();
  const tab = (reg[tabId] ??= {});
  const prev = tab[sender.frameId];
  const sameDoc = prev && prev.documentId === sender.documentId;
  tab[sender.frameId] = {
    frameId: sender.frameId,
    documentId: sender.documentId,
    url: sender.url,
    kinds: patch.kinds ?? (sameDoc ? prev.kinds : []),
    focusedAt: patch.focused ? Date.now() : sameDoc ? prev.focusedAt : 0,
  };
  persist();
}

/** Frames worth asking, most recently focused first; the top frame is always a candidate. */
export async function framesOf(tabId: number, prefer?: number): Promise<FrameEntry[]> {
  const reg = await load();
  const list = Object.values(reg[tabId] ?? {});
  if (!list.some((f) => f.frameId === 0)) list.push({ frameId: 0, url: "", kinds: [], focusedAt: -1 });
  return list.sort((a, b) => (a.frameId === prefer ? -1 : b.frameId === prefer ? 1 : b.focusedAt - a.focusedAt));
}

export async function frameEntry(tabId: number, frameId: number): Promise<FrameEntry | undefined> {
  return (await load())[tabId]?.[frameId];
}

export function forgetTab(tabId: number): void {
  if (registry?.[tabId]) { delete registry[tabId]; persist(); }
}

/** chrome.tabs.sendMessage to exactly one document (or one frame, when the document is unknown). */
export function sendToFrame<T>(tabId: number, f: { frameId: number; documentId?: string }, message: unknown): Promise<T | undefined> {
  const opts: chrome.tabs.MessageSendOptions = f.documentId ? { documentId: f.documentId } : { frameId: f.frameId };
  return (chrome.tabs.sendMessage(tabId, message, opts) as Promise<T | undefined>).catch(() => undefined);
}
