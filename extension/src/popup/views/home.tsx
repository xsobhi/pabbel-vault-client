/**
 * The unlocked popup: the list, and the item / editor / generator screens on
 * top of it. Data comes from the worker already decrypted (names only for
 * the list); secrets are fetched per item when one is opened or copied.
 */
import { useEffect, useState } from "preact/hooks";
import type { DataView, StateView } from "../../shared/messages";
import { t } from "../../shared/i18n";
import { api } from "../api";
import { toast } from "../components/toast";
import { List } from "./list";
import { ItemView } from "./item-view";
import { ItemEdit } from "./item-edit";
import { Generator } from "./generator";

export type Route = { name: "list" } | { name: "view"; id: string } | { name: "edit"; id?: string } | { name: "generator" };

export function Home({ state, onState }: { state: StateView; onState: (s: StateView) => void }) {
  const [data, setData] = useState<DataView | null>(null);
  const [route, setRoute] = useState<Route>({ name: "list" });
  const [loading, setLoading] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    try {
      const view = await api.data(refresh);
      setData(view);
      if (view.stale) setData(await api.data(true)); // the list is up; bring it current underneath
    } catch { toast(t("errorLoad")); onState(await api.state()); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    // Icons are looked up behind the first answer; draw them as they land.
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ("pv.icons" in changes) void api.data().then(setData, () => {});
    };
    chrome.storage.local.onChanged.addListener(onChange);
    return () => chrome.storage.local.onChanged.removeListener(onChange);
  }, []);

  const back = () => { setRoute({ name: "list" }); void load(); };
  if (route.name === "view") return <ItemView id={route.id} data={data} onBack={back} onEdit={() => setRoute({ name: "edit", id: route.id })} />;
  if (route.name === "edit") return <ItemEdit id={route.id} data={data} site={data?.site ?? null} onDone={back} />;
  if (route.name === "generator") return <Generator onBack={back} />;
  const list = <List state={state} data={data} loading={loading} onRoute={setRoute} onState={onState} onRefresh={() => load(true)} />;
  // A team whose shared key failed a check: say so, and send them to the web vault, which says why.
  if (!data?.refused?.length) return list;
  return <>{data.refused.map((name) => <p key={name} class="error refused" role="alert">{t("teamRefused", name)}</p>)}{list}</>;
}
