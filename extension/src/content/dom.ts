/**
 * Building in-page UI without innerHTML. Item names and hosts are data, so
 * they only ever go in through textContent; and pages that enforce Trusted
 * Types would refuse innerHTML anyway, even for our own constant SVG. The SVG
 * marks are therefore built element by element from their (constant) markup.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}

/** Our own constant SVG strings -> DOM, via a tiny tag parser (no HTML parser, no Trusted Types sink). */
export function svg(markup: string): SVGSVGElement {
  const tag = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z:-]+="[^"]*")*)\s*(\/?)>/g;
  const attrRe = /([a-zA-Z:-]+)="([^"]*)"/g;
  const stack: Element[] = [];
  let root: SVGSVGElement | null = null;
  for (let m = tag.exec(markup); m; m = tag.exec(markup)) {
    const [, closing, name, attrs, selfClosing] = m;
    if (closing) { stack.pop(); continue; }
    const el = document.createElementNS(SVG_NS, name);
    for (let a = attrRe.exec(attrs); a; a = attrRe.exec(attrs)) el.setAttribute(a[1], a[2]);
    if (stack.length) stack[stack.length - 1].append(el); else root = el as SVGSVGElement;
    if (!selfClosing) stack.push(el);
  }
  if (!root) throw new Error("bad svg");
  return root;
}

/** The first letter of a name, for the monogram seal. */
export const initial = (name: string) => (name.trim().match(/\p{L}|\p{N}/u)?.[0] ?? "•").toUpperCase();
