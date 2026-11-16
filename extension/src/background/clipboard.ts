/**
 * Clipboard writes that start in the background (the 2-step code copied after
 * a password fill) and the 45-second clearing of anything we put there.
 *
 * Chrome's worker has no DOM, so both happen in an offscreen document opened
 * for that moment. Firefox has no offscreen API, but its MV3 background is an
 * event PAGE with a document of its own, so the same few lines run in place.
 *
 * Best effort, honestly: without the clipboardRead permission (deliberately
 * not requested) we cannot check that the clipboard still holds our secret,
 * so it is cleared regardless - the trade every mainstream manager makes.
 */
import { CLIPBOARD_CLEAR_MS } from "../config";
import { writeWithCopyEvent } from "../shared/clipboard-dom";

const ALARM = "pv.clipboard";
const DOC = "offscreen.html";

export async function scheduleClipboardClear(): Promise<void> {
  await chrome.alarms.create(ALARM, { when: Date.now() + CLIPBOARD_CLEAR_MS });
}

async function viaOffscreen(text: string): Promise<void> {
  const has = await chrome.offscreen.hasDocument?.().catch(() => false);
  if (!has) {
    await chrome.offscreen.createDocument({
      url: DOC,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: "Copy a 2-step code, and clear copied passwords from the clipboard after 45 seconds.",
    });
  }
  try {
    const ok = await chrome.runtime.sendMessage({ target: "offscreen", type: "write-clipboard", text });
    if (!ok) throw new Error("clipboard write refused");
  } finally {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

async function write(text: string): Promise<void> {
  // Compiled out of the Firefox build, which has no offscreen API (and no need for one).
  if (__PV_TARGET__ === "chrome" && typeof chrome.offscreen?.createDocument === "function") return viaOffscreen(text);
  if (typeof document !== "undefined" && writeWithCopyEvent(document, text)) return;
  throw new Error("no clipboard here");
}

/** Put text on the clipboard from the background, and schedule it to be blanked. */
export async function writeClipboard(text: string): Promise<void> {
  await write(text);
  await scheduleClipboardClear();
}

export function handleClipboardAlarm(name: string): boolean {
  if (name !== ALARM) return false;
  void write("").catch(() => {});
  return true;
}
