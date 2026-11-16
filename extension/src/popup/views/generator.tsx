/**
 * The password generator: the web vault's generatePassword with the same
 * dials (length, A-Z, 0-9, symbols), remembered across opens.
 */
import { useEffect, useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import { generatorBits, GENERATOR_MAX, GENERATOR_MIN, DEFAULT_GENERATOR, type GeneratorOptions } from "../../shared/generator";
import { api } from "../api";
import { CopyButton } from "../components/copy-button";
import { Icon } from "../components/icon";

type Dials = Required<GeneratorOptions>;

/** Digits and symbols tinted, so a password can be read back without squinting. */
function Spelled({ value }: { value: string }) {
  return <>{value.split("").map((c) => <span class={/\d/.test(c) ? "g-num" : /[^\w]/.test(c) ? "g-sym" : ""}>{c}</span>)}</>;
}

export function Generator({ onBack }: { onBack: () => void }) {
  const [dials, setDials] = useState<Dials>(DEFAULT_GENERATOR);
  const [pw, setPw] = useState("");
  useEffect(() => { api.settings().then((s) => { setDials(s.generator); }); }, []);
  useEffect(() => { void api.generate(dials).then(setPw); }, [dials]);

  const change = (patch: Partial<Dials>) => {
    const next = { ...dials, ...patch };
    setDials(next);
    void api.setSettings({ generator: next });
  };
  const bits = generatorBits(dials);
  const strength = bits >= 100 ? t("strengthExcellent") : bits >= 70 ? t("strengthStrong") : t("strengthFair");
  const toggle = (key: "uppercase" | "numbers" | "symbols", label: string, sample: string) => (
    <label class="toggle"><input type="checkbox" checked={dials[key]} onChange={(e) => change({ [key]: (e.target as HTMLInputElement).checked })} />
      <span class="toggle-sample mono">{sample}</span><span>{label}</span></label>
  );

  return (
    <div class="screen">
      <header class="bar-head">
        <button type="button" class="icon-btn" onClick={onBack} aria-label={t("actionBack")}><Icon name="arrow-left" class="flip-rtl" /></button>
        <span class="bar-title">{t("generatorTitle")}</span>
      </header>
      <div class="generator">
        <div class="gen-output" aria-live="polite">
          <output class="mono gen-value" dir="ltr"><Spelled value={pw} /></output>
          <div class="gen-tools">
            <span class="gen-strength"><i style={{ "--w": `${Math.min(100, bits / 1.3)}%` }} />{strength} · {t("bits", String(bits))}</span>
            <button type="button" class="icon-btn" onClick={() => void api.generate(dials).then(setPw)} aria-label={t("actionRegenerate")} title={t("actionRegenerate")}><Icon name="refresh-cw" size={16} /></button>
            <CopyButton get={() => pw} label={t("actionCopyPassword")} done={t("toastPasswordCopied")} />
          </div>
        </div>
        <label class="slider">
          <span>{t("generatorLength")}</span><b class="mono">{dials.length}</b>
          <input type="range" min={GENERATOR_MIN} max={GENERATOR_MAX} value={dials.length} onInput={(e) => change({ length: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <div class="toggles">
          {toggle("uppercase", t("generatorUppercase"), "A–Z")}
          {toggle("numbers", t("generatorNumbers"), "0–9")}
          {toggle("symbols", t("generatorSymbols"), "!@#")}
        </div>
        <p class="fine">{t("generatorFine")}</p>
      </div>
    </div>
  );
}
