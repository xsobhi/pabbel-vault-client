/**
 * New item / edit item. The worker does the two-phase create (reserve the id,
 * then PUT ciphertext bound to it) and turns a vault change into create +
 * delete, exactly like the web editor; this screen only collects the fields.
 */
import { useEffect, useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import type { DataView } from "../../shared/messages";
import type { ItemData, ItemType } from "../../shared/items";
import { parseTotpInput } from "@vault/crypto/totp";
import { api } from "../api";
import { Icon } from "../components/icon";
import { toast } from "../components/toast";
import { EditFields } from "./edit-fields";

const empty = (k: ItemType, site?: { host: string } | null): ItemData =>
  k === "login" ? { t: "login", name: site?.host.replace(/^www\./, "") ?? "", username: "", password: "", url: site ? `https://${site.host}` : "", notes: "" }
    : k === "totp" ? { t: "totp", name: "", issuer: "", account: "", secret: "", algorithm: "SHA1", digits: 6, period: 30 }
      : { t: "note", name: "", body: "" };

export function ItemEdit({ id, data, site, onDone }: { id?: string; data: DataView | null; site: { host: string } | null; onDone: () => void }) {
  const personal = data?.vaults.find((v) => v.kind === "personal")?.id ?? data?.vaults[0]?.id ?? "";
  const [d, setD] = useState<ItemData | null>(id ? null : empty("login", site));
  const [vaultId, setVaultId] = useState(personal);
  const [originalVault, setOriginalVault] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.item(id).then((it) => {
      setD(it.data); setVaultId(it.vaultId); setOriginalVault(it.vaultId);
      if (it.data.t === "totp") setSecretInput(it.data.secret);
    }, () => setError(t("errorLoad")));
  }, [id]);

  async function save(e: Event) {
    e.preventDefault();
    if (!d || busy) return;
    let out = d;
    if (out.t === "totp") {
      const p = parseTotpInput(secretInput);
      if (!p) { setError(t("errorSecret")); return; }
      // A bare secret says nothing about the settings, so it keeps the form's (a scanned 8-digit code, or an edited item); an otpauth link sets them.
      const link = /^otpauth:/i.test(secretInput.trim());
      out = { ...out, secret: p.secret, algorithm: link ? p.algorithm ?? out.algorithm : out.algorithm, digits: link ? p.digits ?? out.digits : out.digits, period: link ? p.period ?? out.period : out.period,
        issuer: out.issuer || p.issuer || "", account: out.account || p.account || "" };
    }
    setBusy(true); setError(null);
    try { await api.save(vaultId, out, id); toast(t("toastSaved")); onDone(); }
    catch (err) { setError((err as Error).message || t("errorSave")); setBusy(false); }
  }

  async function remove() {
    if (!id) return;
    setBusy(true);
    try { await api.remove(id); toast(t("toastDeleted")); onDone(); } catch { setError(t("errorSave")); setBusy(false); }
  }

  const moving = !!originalVault && vaultId !== originalVault;
  return (
    <div class="screen">
      <header class="bar-head">
        <button type="button" class="icon-btn" onClick={onDone} aria-label={t("actionBack")}><Icon name="arrow-left" class="flip-rtl" /></button>
        <span class="bar-title">{id ? t("editTitle") : t("newTitle")}</span>
      </header>
      {!d ? <div class="skeleton" aria-busy="true"><span /><span /></div> : (
        <form class="editor" onSubmit={save}>
          {!id && (
            <div class="segmented" role="radiogroup" aria-label={t("fieldType")}>
              {(["login", "totp", "note"] as ItemType[]).map((k) => (
                <button type="button" role="radio" aria-checked={d.t === k} class={d.t === k ? "is-on" : ""} onClick={() => { setD(empty(k, k === "login" ? site : null)); setSecretInput(""); }}>
                  {k === "login" ? t("typeLogin") : k === "totp" ? t("typeTotp") : t("typeNote")}
                </button>
              ))}
            </div>
          )}
          {error && <p class="error" role="alert">{error}</p>}
          <EditFields d={d} set={(patch) => setD({ ...d, ...patch } as ItemData)} secretInput={secretInput} setSecretInput={setSecretInput} />
          {(data?.vaults.length ?? 0) > 1 && (
            <label class="input-label">{id ? t("fieldMoveTo") : t("fieldVault")}
              <select value={vaultId} onChange={(e) => setVaultId((e.target as HTMLSelectElement).value)}>
                {data!.vaults.map((v) => <option value={v.id}>{v.kind === "personal" ? t("vaultPersonal") : v.name}</option>)}
              </select>
              {moving && <small class="hint">{t("moveHint")}</small>}
            </label>
          )}
          <label class="switch"><input type="checkbox" checked={!!d.pinned} onChange={(e) => setD({ ...d, pinned: (e.target as HTMLInputElement).checked })} /><span>{t("fieldPinned")}</span></label>
          <div class="editor-actions">
            {id && (confirmDelete
              ? <button type="button" class="btn btn-danger" onClick={remove} disabled={busy}>{t("actionConfirmDelete")}</button>
              : <button type="button" class="btn btn-quiet" onClick={() => setConfirmDelete(true)}><Icon name="trash-2" size={16} />{t("actionDelete")}</button>)}
            <button type="submit" class="btn btn-primary" disabled={busy}>{busy ? t("saving") : t("actionSave")}</button>
          </div>
        </form>
      )}
    </div>
  );
}
