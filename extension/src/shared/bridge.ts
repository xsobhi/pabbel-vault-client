/** Typed chrome.runtime.sendMessage for extension pages and content scripts. */
import type { AnyRequest } from "./messages";

export class BridgeError extends Error {}

export async function send<T>(req: AnyRequest): Promise<T> {
  const res = (await chrome.runtime.sendMessage(req)) as { ok: true; value: T } | { ok: false; error: string } | undefined;
  if (!res) throw new BridgeError("no answer from the extension");
  if (!res.ok) throw new BridgeError(res.error);
  return res.value;
}
