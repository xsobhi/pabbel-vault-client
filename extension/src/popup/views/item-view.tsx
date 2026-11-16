/**
 * One item, fetched fresh and decrypted by the worker when it is opened (the
 * web vault's openItem). Copy anything, reveal the password, watch the code
 * tick, open the site, or fill it into the page behind the popup.
 */
import { useEffect, useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import type { DataView } from "../../shared/messages";
import type { Item } from "../../shared/items";
import { api } from "../api";
import { CopyButton } from "../components/copy-button";
import { Icon } from "../components/icon";
import { Seal } from "../components/seal";
import { toast } from "../components/toast";
import { groupCode, TotpRing, useTotp } from "../components/totp";
import { MaskNote } from "../components/mask-note";

function Field({ label, value, mono, secret, onCopied, children }: { label: string; value: string; mono?: boolean; secret?: boolean; onCopied?: () => void; children?: preact.ComponentChildren }) {
  const [shown, setShown] = useState(!secret);
  if (!value) return null;
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="field-row">
        <span class={`field-value ${mono ? "mono" : ""} ${!shown ? "masked" : ""}`}>{shown ? value : "•".repeat(Math.min(14, value.length))}</span>
        {children}
        {secret && <button type="button" class="icon-btn" onClick={() => setShown(!shown)} aria-label={shown ? t("actionHide") : t("actionShow")}><Icon name={shown ? "eye-off" : "eye"} size={16} /></button>}
        <CopyButton get={() => value} label={t("actionCopyField", label)} done={t("toastCopied", label)} onCopied={onCopied} />
      </div>
    </div>
  );
}

const hrefOf = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export function ItemView({ id, data, onBack, onEdit }: { id: string; data: DataView | null; onBack: () => void; onEdit: () => void }) {
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api.item(id).then(setItem, () => setError(true)); }, [id]);
  const d = item?.data;
  const code = useTotp(d?.t === "totp" ? d : null);
  const vault = data?.vaults.find((v) => v.id === item?.vaultId);
  const canFill = !!data?.matches.includes(id);
  const row = data?.items.find((i) => i.id === id);

  async function togglePin() {
    if (!item) return;
    await api.pin(item.id);
    setItem({ ...item, data: { ...item.data, pinned: !item.data.pinned } });
  }
  async function fill() {
    if (await api.fillTab(id).catch(() => false)) { toast(t("toastFilled")); window.close(); } else toast(t("errorFill"));
  }

  return (
    <div class="screen">
      <header class="bar-head">
        <button type="button" class="icon-btn" onClick={onBack} aria-label={t("actionBack")}><Icon name="arrow-left" class="flip-rtl" /></button>
        <span class="bar-title">{t("itemTitle")}</span>
        {item && !item.broken && (
          <>
            <button type="button" class={`icon-btn ${d?.pinned ? "is-on" : ""}`} onClick={togglePin} aria-pressed={!!d?.pinned} aria-label={d?.pinned ? t("actionUnpin") : t("actionPin")} title={d?.pinned ? t("actionUnpin") : t("actionPin")}><Icon name="pin" size={16} /></button>
            <button type="button" class="icon-btn" onClick={onEdit} aria-label={t("actionEdit")} title={t("actionEdit")}><Icon name="pencil" size={16} /></button>
          </>
        )}
      </header>
      <div class="detail">
        {error && <p class="error">{t("errorLoad")}</p>}
        {!item && !error && <div class="skeleton" aria-busy="true"><span /><span /></div>}
        {item && d && (
          <>
            <div class="detail-head">
              <Seal name={d.name} type={item.type} size="lg" image={row?.iconKey ? data?.icons[row.iconKey] : undefined} />
              <div><h1 class="display display-sm">{row?.name || d.name || t("untitled")}</h1>
                <p class="muted">{vault ? (vault.kind === "personal" ? t("vaultPersonal") : vault.name) : ""}</p></div>
            </div>
            {d.t === "login" && (
              <>
                <Field label={t("fieldUsername")} value={d.username} />
                <MaskNote username={d.username} />
                <Field label={t("fieldPassword")} value={d.password} mono secret onCopied={() => void api.audit(id, "copy")} />
                {d.url && <Field label={t("fieldWebsite")} value={d.url}><a class="icon-btn" href={hrefOf(d.url)} target="_blank" rel="noreferrer" aria-label={t("actionOpenSite")} title={t("actionOpenSite")}><Icon name="external-link" size={16} /></a></Field>}
                {d.notes && <div class="field"><span class="field-label">{t("fieldNotes")}</span><p class="note-body">{d.notes}</p></div>}
              </>
            )}
            {d.t === "totp" && (
              <>
                <div class="code-card">
                  <span class="code mono">{code ? groupCode(code.code) : "••• •••"}</span>
                  {code && <TotpRing left={code.left} period={code.period} size={34} />}
                  <CopyButton get={() => code?.code ?? ""} label={t("actionCopyCode")} done={t("toastCodeCopied")} onCopied={() => void api.audit(id, "code")} />
                </div>
                <Field label={t("fieldIssuer")} value={d.issuer} />
                <Field label={t("fieldAccount")} value={d.account} />
              </>
            )}
            {d.t === "note" && <div class="field"><span class="field-label">{t("fieldNote")}</span><p class="note-body">{d.body}</p>
              <CopyButton get={() => d.body} label={t("actionCopyNote")} done={t("toastNoteCopied")} /></div>}
            {canFill && d.t !== "note" && <button type="button" class="btn btn-primary btn-wide" onClick={fill}><Icon name="zap" size={16} />{t("actionFillThisPage")}</button>}
          </>
        )}
      </div>
    </div>
  );
}
