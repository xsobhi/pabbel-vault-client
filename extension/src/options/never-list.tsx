import { useEffect, useState } from "preact/hooks";
import { t } from "../shared/i18n";
import { api } from "../popup/api";
import { Icon } from "../popup/components/icon";

/** Sites where "Never for this site" was chosen; removing one brings the save prompt back there. */
export function NeverList() {
  const [list, setList] = useState<string[] | null>(null);
  useEffect(() => { void api.neverList().then(setList); }, []);
  return (
    <section class="opt-card" aria-labelledby="o-never">
      <h2 id="o-never" class="section"><span>{t("optionsNever")}</span><em>{list?.length ?? ""}</em></h2>
      {list && !list.length && <p class="muted pad">{t("optionsNeverEmpty")}</p>}
      <ul class="never">
        {list?.map((site) => (
          <li key={site}><span>{site}</span>
            <button type="button" class="icon-btn" onClick={async () => setList(await api.neverRemove(site))} aria-label={t("actionRemoveSite", site)} title={t("actionRemoveSite", site)}><Icon name="x" size={16} /></button></li>
        ))}
      </ul>
    </section>
  );
}
