/**
 * Strings come from _locales/<lang>/messages.json through chrome.i18n, so
 * the browser's language decides, exactly as it does for the store listing.
 * A missing key shows the key itself - loud in review, never blank.
 */
export function t(key: string, subs?: string | (string | number)[]): string {
  const list = subs === undefined ? undefined : (Array.isArray(subs) ? subs : [subs]).map(String);
  try {
    return chrome.i18n.getMessage(key, list) || key;
  } catch {
    return key;
  }
}

export function uiLanguage(): string {
  try { return chrome.i18n.getUILanguage(); } catch { return "en"; }
}

/** ar, fa and ur read right to left; Chrome reports it per locale through @@bidi_dir. */
export function isRtl(): boolean {
  return t("@@bidi_dir") === "rtl";
}

/** Set lang + dir on an extension page before it paints. */
export function applyDocumentLocale(doc: Document = document): void {
  doc.documentElement.lang = uiLanguage();
  doc.documentElement.dir = isRtl() ? "rtl" : "ltr";
}
