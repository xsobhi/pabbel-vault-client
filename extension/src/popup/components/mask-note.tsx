/**
 * Under a login whose username is an email mask: whether mail to it still
 * arrives. Asked only for addresses on the mask domains, and only shown for
 * this account's own masks (anything else answers null and shows nothing).
 */
import { useEffect, useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import { isMaskAddress } from "../../shared/masks";
import { api } from "../api";
import { Icon } from "./icon";

export function MaskNote({ username }: { username: string }) {
  const [state, setState] = useState<"active" | "paused" | null>(null);
  useEffect(() => {
    setState(null);
    if (!isMaskAddress(username)) return;
    let live = true;
    api.maskState(username).then((s) => { if (live) setState(s); }, () => {});
    return () => { live = false; };
  }, [username]);
  if (!state) return null;
  return (
    <p class={`mask-note ${state === "paused" ? "is-paused" : ""}`}>
      <Icon name="venetian-mask" size={14} /><span>{t(state === "paused" ? "itemMaskPaused" : "itemMaskActive")}</span>
    </p>
  );
}
