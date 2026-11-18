/** The fields of each item type, as the web editor has them. */
import { useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import type { ItemData } from "../../shared/items";
import { api } from "../api";
import { Icon } from "../components/icon";
import { QrScan } from "../qr/qr-scan";

function Text({ label, value, onInput, type = "text", mono, placeholder, autoFocus, children }: {
  label: string; value: string; onInput: (v: string) => void; type?: string; mono?: boolean; placeholder?: string; autoFocus?: boolean; children?: preact.ComponentChildren;
}) {
  return (
    <label class="input-label">{label}
      <span class="input-wrap">
        <input type={type} class={mono ? "mono" : ""} value={value} placeholder={placeholder} autoFocus={autoFocus} spellcheck={false} autocomplete="off"
          onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
        {children}
      </span>
    </label>
  );
}

export function EditFields({ d, set, secretInput, setSecretInput }: {
  d: ItemData; set: (patch: Partial<ItemData>) => void; secretInput: string; setSecretInput: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const name = <Text label={t("fieldName")} value={d.name} onInput={(v) => set({ name: v })} placeholder={t("fieldNamePlaceholder")} autoFocus />;
  if (d.t === "login") {
    return (
      <>
        {name}
        <Text label={t("fieldUsername")} value={d.username} onInput={(v) => set({ username: v })} />
        <Text label={t("fieldPassword")} type={show ? "text" : "password"} mono value={d.password} onInput={(v) => set({ password: v })}>
          <button type="button" class="icon-btn" onClick={() => setShow(!show)} aria-label={show ? t("actionHide") : t("actionShow")}><Icon name={show ? "eye-off" : "eye"} size={16} /></button>
          <button type="button" class="icon-btn" onClick={async () => { set({ password: await api.generate() }); setShow(true); }} aria-label={t("actionGenerate")} title={t("actionGenerate")}><Icon name="wand-sparkles" size={16} /></button>
        </Text>
        <Text label={t("fieldWebsite")} type="url" value={d.url} onInput={(v) => set({ url: v })} placeholder="https://" />
        <label class="input-label">{t("fieldNotes")}<textarea rows={3} value={d.notes} onInput={(e) => set({ notes: (e.target as HTMLTextAreaElement).value })} /></label>
      </>
    );
  }
  if (d.t === "totp") {
    return (
      <>
        {name}
        <QrScan onPick={(p) => { set({ issuer: p.issuer ?? "", account: p.account ?? "", algorithm: p.algorithm ?? "SHA1", digits: p.digits ?? 6, period: p.period ?? 30, name: d.name || p.issuer || p.account || "" }); setSecretInput(p.secret); }} />
        <Text label={t("fieldSecret")} mono value={secretInput} onInput={setSecretInput} placeholder={t("fieldSecretPlaceholder")} />
        <Text label={t("fieldIssuer")} value={d.issuer} onInput={(v) => set({ issuer: v })} />
        <Text label={t("fieldAccount")} value={d.account} onInput={(v) => set({ account: v })} />
      </>
    );
  }
  return (
    <>
      {name}
      <label class="input-label">{t("fieldNote")}<textarea rows={8} value={d.body} onInput={(e) => set({ body: (e.target as HTMLTextAreaElement).value })} /></label>
    </>
  );
}
