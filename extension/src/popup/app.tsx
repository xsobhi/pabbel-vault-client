/**
 * The popup's state machine: signed out -> no vault / locked -> unlocked.
 * The worker is the source of truth; the popup asks it on open and listens
 * for the keys disappearing from session storage (auto-lock, lock from the
 * context menu) so it never shows a vault that is no longer open.
 */
import { useEffect, useState } from "preact/hooks";
import type { StateView } from "../shared/messages";
import { api } from "./api";
import { Toaster } from "./components/toast";
import { SignIn } from "./views/sign-in";
import { Unlock } from "./views/unlock";
import { NoVault } from "./views/no-vault";
import { Home } from "./views/home";

let lastPing = 0;
function pingActivity() {
  if (Date.now() - lastPing < 15_000) return;
  lastPing = Date.now();
  void api.activity().catch(() => {}); // using the popup keeps the vault open
}

export function App() {
  const [st, setSt] = useState<StateView | null>(null);
  const refresh = () => api.state().then(setSt, () => setSt({ signedIn: false, account: null, vault: "unknown" }));

  useEffect(() => {
    void refresh();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ("pv.keys" in changes || "pv.auth" in changes) void refresh();
    };
    chrome.storage.session.onChanged.addListener(onChange);
    chrome.storage.local.onChanged.addListener(onChange);
    document.addEventListener("pointerdown", pingActivity, { passive: true });
    document.addEventListener("keydown", pingActivity, { passive: true });
    return () => {
      chrome.storage.session.onChanged.removeListener(onChange);
      chrome.storage.local.onChanged.removeListener(onChange);
    };
  }, []);

  let view;
  if (!st) view = <div class="splash" aria-busy="true" />;
  else if (!st.signedIn) view = <SignIn onState={setSt} />;
  else if (st.vault === "none") view = <NoVault state={st} onState={setSt} />;
  else if (st.vault !== "unlocked") view = <Unlock state={st} onState={setSt} onUnlocked={refresh} />;
  else view = <Home state={st} onState={setSt} />;

  return (
    <>
      {view}
      <Toaster />
    </>
  );
}
