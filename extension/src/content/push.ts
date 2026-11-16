/**
 * Messages the worker sends to this frame: "what is focused here?" (no
 * secrets), "fill this" (after the person asked, by shortcut or menu), "show
 * the save bar", and "the vault locked - close the dropdown".
 */
import type { ProbeReply, WorkerPush } from "../shared/messages";
import { send } from "../shared/bridge";
import { deepActive, isInput } from "./fields";
import { fillNewPassword, probe } from "./fill-dom";
import { applyFill } from "./menu-actions";
import { afterPasswordFill } from "./code-step";
import { closeMenu } from "./menu";
import { showBar } from "./savebar";
import { toast } from "./overlay";
import { t } from "../shared/i18n";

export function installPushHandler(lastField: () => HTMLInputElement | null): void {
  const field = () => { const a = deepActive(); return isInput(a) ? a : lastField(); };
  chrome.runtime.onMessage.addListener((msg: WorkerPush, sender, reply) => {
    if (sender.id !== chrome.runtime.id || sender.tab) return false; // only the worker talks to us
    switch (msg?.type) {
      case "sw:probe": reply(probe(field()) satisfies ProbeReply); return false;
      case "sw:fill": {
        const done = applyFill(field(), msg);
        reply(done);
        if (done.password && msg.id) void afterPasswordFill(msg.id);
        return false;
      }
      case "sw:fillGenerated": {
        const ok = fillNewPassword(field(), msg.password);
        if (ok) toast(t("toastGenerated"), field()?.getBoundingClientRect() ?? null);
        reply({ filled: ok });
        return false;
      }
      case "sw:saveBar":
        if (window.top === window) showBar(msg.info, (action, vaultId) => send<{ ok: boolean }>({ type: "cs:saveBar", action, vaultId }).then((r) => r.ok, () => false));
        return false;
      case "sw:locked": closeMenu(); return false;
    }
    return false;
  });
}
