/**
 * Search, vault scope, then "For this site" above everything else. Pinned
 * items lead each section (the worker sorts: pinned, then by name).
 */
import { useMemo, useState } from "preact/hooks";
import { t } from "../../shared/i18n";
import type { DataView, StateView } from "../../shared/messages";
import type { ItemSummary } from "../../shared/items";
import { api } from "../api";
import { Icon } from "../components/icon";
import { Header } from "./header";
import { ItemRow } from "./item-row";
import type { Route } from "./home";

const matchesQuery = (it: ItemSummary, q: string) =>
  !q || `${it.name} ${it.subtitle} ${it.url}`.toLowerCase().includes(q);

export function List({ state, data, loading, onRoute, onState, onRefresh }: {
  state: StateView; data: DataView | null; loading: boolean; onRoute: (r: Route) => void; onState: (s: StateView) => void; onRefresh: () => void;
}) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<string>("all");
  const query = q.trim().toLowerCase();
  const items = useMemo(
    () => (data?.items ?? []).filter((i) => (scope === "all" || i.vaultId === scope) && matchesQuery(i, query)),
    [data, scope, query],
  );
  const here = useMemo(() => {
    const order = new Map((data?.matches ?? []).map((id, i) => [id, i]));
    return items.filter((i) => order.has(i.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }, [items, data]);
  const vaultName = (id: string) => {
    const v = data?.vaults.find((x) => x.id === id);
    return !v ? "" : v.kind === "personal" ? t("vaultPersonal") : v.name;
  };
  const showVault = (data?.vaults.length ?? 0) > 1 && scope === "all";
  const row = (it: ItemSummary, i: number) => (
    <ItemRow key={it.id} item={it} index={i} vault={showVault ? vaultName(it.vaultId) : ""} image={it.iconKey ? data?.icons[it.iconKey] : undefined} onOpen={() => onRoute({ name: "view", id: it.id })} canFill={here.some((h) => h.id === it.id)} />
  );

  return (
    <div class="screen">
      <Header onRoute={onRoute} onState={onState} onRefresh={onRefresh} />
      <div class="search">
        <Icon name="search" size={16} />
        <input type="search" placeholder={t("searchPlaceholder")} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label={t("searchPlaceholder")} autofocus />
      </div>
      {(data?.vaults.length ?? 0) > 1 && (
        <nav class="chips" aria-label={t("vaultsLabel")}>
          {[{ id: "all", label: t("scopeAll") }, ...(data?.vaults ?? []).map((v) => ({ id: v.id, label: v.kind === "personal" ? t("vaultPersonal") : v.name }))].map((c) => (
            <button type="button" key={c.id} class={`chip ${scope === c.id ? "is-on" : ""}`} aria-pressed={scope === c.id} onClick={() => setScope(c.id)}>{c.label}</button>
          ))}
        </nav>
      )}
      <div class={`list ${loading && !data ? "is-loading" : ""}`}>
        {!data && <div class="skeleton" aria-busy="true"><span /><span /><span /></div>}
        {data && data.site && !query && (
          <section aria-labelledby="sec-here">
            <h2 id="sec-here" class="section"><span>{t("sectionThisSite")}</span><em>{data.site.site}</em></h2>
            {here.length ? here.map(row) : <p class="empty-inline">{t("emptyThisSite")}</p>}
          </section>
        )}
        {data && (
          <section aria-labelledby="sec-all">
            <h2 id="sec-all" class="section"><span>{query ? t("sectionResults") : t("sectionAll")}</span><em>{items.length}</em></h2>
            {items.length ? items.map(row) : (
              <div class="empty"><p>{query ? t("emptySearch") : t("emptyVault")}</p>
                {!query && <button type="button" class="btn btn-primary" onClick={() => onRoute({ name: "edit" })}><Icon name="plus" size={16} />{t("actionNewItem")}</button>}
              </div>
            )}
          </section>
        )}
      </div>
      <footer class="foot">
        <span class="avatar" aria-hidden="true">{(state.account?.name || state.account?.email || "?").trim()[0]?.toUpperCase()}</span>
        <span class="foot-email">{state.account?.email}</span>
        <button type="button" class="btn btn-quiet btn-small" onClick={async () => onState(await api.lock())}><Icon name="lock" size={14} />{t("actionLock")}</button>
      </footer>
    </div>
  );
}
