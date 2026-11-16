/**
 * Reading fields off the page: their describing words, whether a person can
 * actually see them, and every input in the document including open shadow
 * roots (web-component sign-in forms). Nothing here decides anything - that
 * is classify.ts and forms.ts.
 */
import { classify, type FieldClass, type FieldDesc } from "./classify";

const seenAsPassword = new WeakSet<HTMLInputElement>();

function labelText(el: HTMLInputElement): string {
  const parts: string[] = [];
  for (const l of Array.from(el.labels ?? [])) parts.push(l.textContent ?? "");
  const by = el.getAttribute("aria-labelledby");
  if (by) for (const id of by.split(/\s+/)) parts.push(el.ownerDocument.getElementById(id)?.textContent ?? "");
  parts.push(el.title ?? "");
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 200);
}

export function describe(el: HTMLInputElement): FieldDesc {
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  if (type === "password") seenAsPassword.add(el);
  return {
    type,
    name: el.name ?? "",
    id: el.id ?? "",
    autocomplete: el.getAttribute("autocomplete") ?? "",
    placeholder: el.placeholder ?? "",
    ariaLabel: el.getAttribute("aria-label") ?? "",
    label: labelText(el),
    inputMode: (el.getAttribute("inputmode") ?? "").toLowerCase(),
    maxLength: el.maxLength ?? -1,
    pattern: el.getAttribute("pattern") ?? "",
    wasPassword: seenAsPassword.has(el),
  };
}

const classCache = new WeakMap<HTMLInputElement, { key: string; cls: FieldClass }>();

/** classify(describe(el)), memoised on the attributes that feed it. */
export function classOf(el: HTMLInputElement): FieldClass {
  const key = [el.type, el.name, el.id, el.getAttribute("autocomplete"), el.placeholder, el.maxLength].join("\u0001");
  const hit = classCache.get(el);
  if (hit && hit.key === key && !seenAsPassword.has(el)) return hit.cls;
  const cls = classify(describe(el));
  classCache.set(el, { key, cls });
  return cls;
}

/** Can a person see and type into it? Hidden, zero-sized, transparent and off-canvas fields are never filled. */
export function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected || (el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  if (r.right + view.scrollX < 0 || r.bottom + view.scrollY < 0) return false;
  if (el.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  let node: Element | null = el;
  for (let depth = 0; node && depth < 12; depth++, node = node.parentElement) {
    const cs = view.getComputedStyle(node);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (Number(cs.opacity) < 0.1) return false;
    if (depth === 0 && cs.clipPath && cs.clipPath !== "none" && /inset\(\s*50%|circle\(\s*0/.test(cs.clipPath)) return false;
  }
  return true;
}

const SHADOW_SCAN_LIMIT = 4000;

let memo: { doc: Document; at: number; list: HTMLInputElement[] } | null = null;

/** Every <input> in the document and in open shadow roots (memoised for a moment: one scan asks many times). */
export function allInputs(doc: Document = document): HTMLInputElement[] {
  if (memo && memo.doc === doc && performance.now() - memo.at < 200) return memo.list;
  const list = collectInputs(doc);
  memo = { doc, at: performance.now(), list };
  return list;
}

function collectInputs(doc: Document): HTMLInputElement[] {
  const out = Array.from(doc.querySelectorAll("input"));
  const all = doc.getElementsByTagName("*");
  if (all.length > SHADOW_SCAN_LIMIT) return out;
  const visit = (root: ParentNode) => {
    for (const el of Array.from(root.querySelectorAll("*"))) {
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) { out.push(...Array.from(sr.querySelectorAll("input"))); visit(sr); }
    }
  };
  visit(doc);
  return out;
}

/** The element that has focus, looking through open shadow roots. */
export function deepActive(doc: Document = document): Element | null {
  let a: Element | null = doc.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

export const isInput = (el: unknown): el is HTMLInputElement => el instanceof HTMLInputElement;
