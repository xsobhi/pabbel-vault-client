import { t } from "../../shared/i18n";
import type { ItemSummary } from "../../shared/items";
import { api } from "../api";
import { CopyButton } from "../components/copy-button";
import { Icon } from "../components/icon";
import { Seal } from "../components/seal";
import { totp } from "@vault/crypto/totp";
import { toast } from "../components/toast";

/** One list row: open on click; copy (and fill, when it belongs to this tab) without opening. */
export function ItemRow({ item, index, vault, image, onOpen, canFill }: { item: ItemSummary; index: number; vault: string; image?: string; onOpen: () => void; canFill: boolean }) {
  const secret = async (field: "username" | "password" | "code") => {
    const full = await api.item(item.id);
    const d = full.data;
    if (field === "username" && d.t === "login") return d.username;
    if (field === "password" && d.t === "login") { void api.audit(item.id, "copy"); return d.password; }
    if (field === "code" && d.t === "totp") { void api.audit(item.id, "code"); return (await totp(d)).code; }
    return "";
  };
  async function fill(e: Event) {
    e.stopPropagation();
    if (await api.fillTab(item.id).catch(() => false)) { toast(t("toastFilled")); window.close(); }
    else toast(t("errorFill"));
  }
  return (
    <div class="row" role="button" tabIndex={0} style={{ "--i": Math.min(index, 12) }} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} aria-label={item.name}>
      <Seal name={item.name} type={item.type} image={image} />
      <span class="row-text">
        <span class="row-name">{item.pinned && <Icon name="pin" size={12} class="pin" />}{item.name || t("untitled")}</span>
        <span class="row-sub">{item.broken ? t("brokenItem") : [item.subtitle, vault].filter(Boolean).join(" · ")}</span>
      </span>
      <span class="row-actions" onClick={(e) => e.stopPropagation()}>
        {canFill && (item.type === "login" || item.type === "totp") && (
          <button type="button" class="icon-btn" onClick={fill} aria-label={t("actionFill")} title={t("actionFill")}><Icon name="zap" size={16} /></button>
        )}
        {item.type === "login" && !item.broken && (
          <>
            <CopyButton get={() => secret("username")} label={t("actionCopyUsername")} done={t("toastUsernameCopied")} />
            <CopyButton get={() => secret("password")} label={t("actionCopyPassword")} done={t("toastPasswordCopied")} />
          </>
        )}
        {item.type === "totp" && !item.broken && <CopyButton get={() => secret("code")} label={t("actionCopyCode")} done={t("toastCodeCopied")} />}
      </span>
    </div>
  );
}
