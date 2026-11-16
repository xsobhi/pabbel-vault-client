/**
 * Getting one site's icon. The worker asks the site itself, with no cookies
 * and no referrer: nothing goes through Pabbel, or through any icon service,
 * so no server learns what is in the vault. Bitmaps come back as a 64px PNG;
 * small SVGs are kept as they are (an <img> never runs what is inside one).
 */
import { b64 } from "@vault/crypto/bytes";
import { iconLinks, isPublicHost } from "../shared/favicon";

const TIMEOUT_MS = 4000;
const MAX_BYTES = 512 * 1024;
const MAX_SVG = 16 * 1024;
const SIDE = 64;
/** Sharp enough for a 34px tile on a 2x screen: stop looking at this size. */
const GOOD_SIDE = 32;

interface Found { data: string; side: number }

async function get(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok || !res.url.startsWith("https://")) return null;
    const blob = await res.blob();
    return blob.size > 0 && blob.size <= MAX_BYTES ? blob : null;
  } catch { return null; }
}

async function decode(blob: Blob): Promise<Found | null> {
  const type = blob.type.toLowerCase();
  if (type.includes("svg")) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > MAX_SVG || !/<svg[\s>]/i.test(new TextDecoder().decode(bytes))) return null;
    return { data: `data:image/svg+xml;base64,${b64(bytes)}`, side: 512 };
  }
  if (type.startsWith("text/")) return null; // a single-page app answering every path with its HTML
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap || bitmap.width < 16 || bitmap.height < 16) return null;
  const canvas = new OffscreenCanvas(SIDE, SIDE);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, SIDE, SIDE);
  const png = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
  return { data: `data:image/png;base64,${b64(png)}`, side: Math.min(bitmap.width, bitmap.height) };
}

async function linksOn(origin: string): Promise<string[]> {
  const page = await get(`${origin}/`);
  if (!page || !page.type.toLowerCase().includes("html")) return [];
  return iconLinks(await page.slice(0, 128 * 1024).text(), `${origin}/`);
}

/** The best icon for an https origin, or null. `hint` is the icon the page itself linked, when it was seen. */
export async function fetchIcon(origin: string, site: string, hint?: string): Promise<string | null> {
  const url = new URL(origin);
  if (url.protocol !== "https:" || !isPublicHost(url.hostname)) return null;
  let best: Found | null = null;
  const consider = async (candidate: string) => {
    const blob = await get(candidate);
    const found = blob && (await decode(blob).catch(() => null));
    if (found && found.side > (best?.side ?? 0)) best = found;
    return (best?.side ?? 0) >= GOOD_SIDE;
  };
  const apex = url.hostname === site ? null : Object.assign(new URL(origin), { hostname: site }).origin;
  for (const u of [hint, `${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`]) {
    if (u && (await consider(u))) return best!.data;
  }
  for (const u of await linksOn(origin)) if (await consider(u)) return best!.data;
  if (!best && apex) await consider(`${apex}/favicon.ico`);
  return (best as Found | null)?.data ?? null;
}
