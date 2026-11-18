import jsQR from "jsqr";

/**
 * Find every QR code in a picture, on this device only (jsQR is pure JS, so it
 * works in Firefox, which has no BarcodeDetector). jsQR returns one code per
 * call, so after each hit we paint that code's box white and look again.
 * Two codes in one picture can confuse it into finding neither, so if the
 * whole picture gives nothing we look again in overlapping tiles.
 */
export interface Pixels { data: Uint8ClampedArray; width: number; height: number }
type Box = [x: number, y: number, w: number, h: number];

function crop(p: Pixels, [x, y, w, h]: Box): Pixels {
  if (w === p.width && h === p.height) return p;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) data.set(p.data.subarray(((y + row) * p.width + x) * 4, ((y + row) * p.width + x + w) * 4), row * w * 4);
  return { data, width: w, height: h };
}

function scanBox(px: Pixels, box: Box, found: string[], max: number): void {
  while (found.length < max) {
    const sub = crop(px, box);
    const hit = jsQR(sub.data, sub.width, sub.height, { inversionAttempts: "attemptBoth" });
    if (!hit) return;
    if (!found.includes(hit.data)) found.push(hit.data);
    const l = hit.location;
    const c = [l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner];
    const xs = c.map((p) => p.x), ys = c.map((p) => p.y);
    const pad = Math.max(2, (Math.max(...xs) - Math.min(...xs)) * 0.06);
    const x0 = Math.max(0, Math.floor(box[0] + Math.min(...xs) - pad)), x1 = Math.min(px.width, Math.ceil(box[0] + Math.max(...xs) + pad));
    const y0 = Math.max(0, Math.floor(box[1] + Math.min(...ys) - pad)), y1 = Math.min(px.height, Math.ceil(box[1] + Math.max(...ys) + pad));
    for (let y = y0; y < y1; y++) px.data.fill(255, (y * px.width + x0) * 4, (y * px.width + x1) * 4);
  }
}

export function scanQrCodes(src: Pixels, max = 6): string[] {
  const px = { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height }; // never paint on the caller's copy
  const found: string[] = [];
  scanBox(px, [0, 0, px.width, px.height], found, max);
  if (!found.length) {
    const w = Math.ceil((px.width * 2) / 3), h = Math.ceil((px.height * 2) / 3);
    for (const x of [0, px.width - w]) for (const y of [0, px.height - h]) scanBox(px, [x, y, w, h], found, max);
    // What a tile found is now blanked, so the rest may read cleanly in the whole picture.
    if (found.length) scanBox(px, [0, 0, px.width, px.height], found, max);
  }
  return found;
}
