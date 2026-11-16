/**
 * Bring up the popup from the background (the in-page "Unlock" button, the
 * shortcut while locked). action.openPopup() exists in current Chrome and
 * Firefox but may refuse without a fresh gesture; the fallback is the same
 * page in a small window, which always works.
 */
export async function openPopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
    return;
  } catch { /* fall through */ }
  await chrome.windows.create({ url: chrome.runtime.getURL("popup.html?window=1"), type: "popup", width: 380, height: 600, focused: true }).catch(() => {});
}
