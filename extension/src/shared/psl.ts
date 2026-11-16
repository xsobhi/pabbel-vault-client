/**
 * Registrable domains (eTLD+1) from the bundled Public Suffix List.
 *
 * Matching logins by registrable domain is what lets accounts.google.com and
 * mail.google.com share a login while bob.github.io and eve.github.io never
 * do: github.io is a public suffix (in the list's PRIVATE section, which is
 * why both sections are loaded). The algorithm is the list's own
 * (publicsuffix.org/list): the longest matching rule wins, exception rules
 * beat wildcards, and the implicit default rule is "*".
 */
export interface Psl {
  /** "a.b.example.co.uk" -> "example.co.uk"; null for a bare suffix, an IP or an empty host. */
  registrable(host: string): string | null;
  /** The public suffix part: "a.example.co.uk" -> "co.uk". */
  suffix(host: string): string | null;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Rules are Unicode in the list but hosts reach us as punycode (URL.hostname): normalise once. */
function toAscii(rule: string): string {
  if (/^[\x00-\x7f]*$/.test(rule)) return rule;
  try { return new URL(`http://${rule}`).hostname; } catch { return rule; }
}

export function isIpHost(host: string): boolean {
  return IPV4.test(host) || host.includes(":") || host.startsWith("[");
}

export function createPsl(listText: string): Psl {
  const rules = new Set<string>();
  const wild = new Set<string>();
  const except = new Set<string>();
  for (const raw of listText.split("\n")) {
    const line = raw.trim().split(/\s/)[0];
    if (!line || line.startsWith("//")) continue;
    const rule = line.toLowerCase();
    if (rule.startsWith("!")) except.add(toAscii(rule.slice(1)));
    else if (rule.startsWith("*.")) wild.add(toAscii(rule.slice(2)));
    else rules.add(toAscii(rule));
  }

  /** How many labels of `labels` form the public suffix. */
  function suffixLength(labels: string[]): number {
    const n = labels.length;
    for (let i = 0; i < n; i++) {
      const candidate = labels.slice(i).join(".");
      if (except.has(candidate)) return n - i - 1;
      if (rules.has(candidate)) return n - i;
      if (i + 1 < n && wild.has(labels.slice(i + 1).join("."))) return n - i;
    }
    return 1; // the default rule "*"
  }

  function clean(host: string): string[] | null {
    const h = host.trim().toLowerCase().replace(/\.$/, "");
    if (!h || h.startsWith(".") || h.includes("..") || isIpHost(h)) return null;
    return h.split(".");
  }

  return {
    registrable(host) {
      const labels = clean(host);
      if (!labels) return null;
      const len = suffixLength(labels);
      return labels.length > len ? labels.slice(labels.length - len - 1).join(".") : null;
    },
    suffix(host) {
      const labels = clean(host);
      if (!labels) return null;
      return labels.slice(labels.length - suffixLength(labels)).join(".");
    },
  };
}
