/**
 * Chrome only: the offscreen document the worker opens to touch the clipboard
 * (see background/clipboard.ts). It answers one message and is closed again.
 */
import { writeWithCopyEvent } from "../shared/clipboard-dom";

chrome.runtime.onMessage.addListener((msg: { target?: string; type?: string; text?: string }, sender, reply) => {
  if (msg?.target !== "offscreen" || sender.id !== chrome.runtime.id) return false;
  if (msg.type === "write-clipboard") reply(writeWithCopyEvent(document, String(msg.text ?? "")));
  return false;
});
