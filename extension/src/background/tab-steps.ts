/**
 * What a sign-in in progress is waiting for, one entry per tab: which item,
 * for which site, since when. Ids only, never a secret. Kept in
 * storage.session, so a worker stopped between two pages still remembers,
 * and cleared on lock with everything else there.
 *
 * Every change runs one after another: two frames asking at the same moment
 * must not both find the entry before either has used it up.
 */
import { NEXT_STEP_MS } from "../config";
import { getSession, setSession } from "./storage";

export interface Step { id: string; site: string; at: number }
type Store = Record<string, Step>;

/** Was this step made for that site, and recently enough? */
export const stepFits = (step: Step, site: string, now = Date.now()) => step.site === site && now - step.at <= NEXT_STEP_MS;

export function tabSteps(key: string) {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };
  const load = async () => (await getSession<Store>(key)) ?? {};
  const drop = async (tabId: number): Promise<Step | null> => {
    const all = await load();
    const step = all[tabId] ?? null;
    if (step) { delete all[tabId]; await setSession(key, all); }
    return step;
  };
  return {
    remember: (tabId: number, step: Step) => serial(async () => { await setSession(key, { ...(await load()), [tabId]: step }); }),
    forget: (tabId: number) => serial(async () => { await drop(tabId); }),
    /** The tab's step, removed as it is read: the first to ask uses it up, whatever it then decides. */
    take: (tabId: number) => serial(() => drop(tabId)),
  };
}
