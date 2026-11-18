/**
 * Getting a picture into jsQR, in the popup. Everything stays data: URLs (the
 * popup CSP is `img-src 'self' data:`, no blob:) and nothing is fetched or logged.
 */
import { scanQrCodes } from "../../shared/qr-scan";

const MAX_SIDE = 4000;
// Native size first (a dense Google Authenticator export dies when shrunk), then smaller: noisy photos of a screen decode better averaged.
const FALLBACK_SIDES = [2000, 1400, 1000];

export const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("read")); r.readAsDataURL(b); });

export async function decodeDataUrl(url: string): Promise<string[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("image")); i.src = url; });
  const longest = Math.max(img.width, img.height);
  for (const side of [Math.min(longest, MAX_SIDE), ...FALLBACK_SIDES.filter((s) => s < longest)]) {
    const scale = Math.min(1, side / longest);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const found = scanQrCodes(ctx.getImageData(0, 0, c.width, c.height));
    if (found.length) return found;
  }
  return [];
}

/** The visible tab as a PNG data URL. Needs `activeTab` (granted by opening the popup). */
export const captureTab = (): Promise<string> => chrome.tabs.captureVisibleTab({ format: "png" });

/** First image on the clipboard (Async Clipboard API; Firefox 140 has it, else the paste event covers it). */
export async function clipboardImage(): Promise<Blob | null> {
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((x) => x.startsWith("image/"));
    if (type) return item.getType(type);
  }
  return null;
}
