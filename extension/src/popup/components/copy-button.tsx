import { useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import { copyText } from "../api";
import { Icon } from "./icon";
import { toast } from "./toast";

/** Copy a value (fetched lazily when it is a secret), confirm, and let the worker clear it in 45 s. */
export function CopyButton({ get, label, done, onCopied }: { get: () => Promise<string> | string; label: string; done: string; onCopied?: () => void }) {
  const [ok, setOk] = useState(false);
  async function go(e: Event) {
    e.stopPropagation();
    try {
      const text = await get();
      if (!text) return;
      await copyText(text);
      onCopied?.();
      setOk(true);
      toast(done);
      setTimeout(() => setOk(false), 1200);
    } catch { toast(t("errorClipboard")); }
  }
  return (
    <button type="button" class={`icon-btn ${ok ? "is-done" : ""}`} onClick={go} aria-label={label} title={label}>
      <Icon name={ok ? "check" : "copy"} size={16} />
    </button>
  );
}
