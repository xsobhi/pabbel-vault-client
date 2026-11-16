/**
 * Preferences and the never-save list, both in storage.local. Neither is
 * secret: the never list is a set of site names the person asked us to stop
 * offering to save for, which is the same information as "has an account
 * there" at worst, and it never leaves the device.
 */
import { DEFAULT_LOCK_MINUTES, LOCK_CHOICES, type LockMinutes } from "../config";
import { DEFAULT_GENERATOR, GENERATOR_MAX, GENERATOR_MIN } from "../shared/generator";
import type { Settings } from "../shared/messages";
import { getLocal, LOCAL, setLocal } from "./storage";

export const DEFAULT_SETTINGS: Settings = {
  lockMinutes: DEFAULT_LOCK_MINUTES,
  inlineButton: true,
  savePrompts: true,
  copyTotp: true,
  typeTotp: true,
  showIcons: true,
  generator: { ...DEFAULT_GENERATOR },
};

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();
export const onSettingsChange = (fn: (s: Settings) => void) => { listeners.add(fn); };

export async function getSettings(): Promise<Settings> {
  if (cache) return cache;
  const stored = (await getLocal<Partial<Settings>>(LOCAL.settings)) ?? {};
  cache = sanitize({ ...DEFAULT_SETTINGS, ...stored, generator: { ...DEFAULT_GENERATOR, ...(stored.generator ?? {}) } });
  return cache;
}

function sanitize(s: Settings): Settings {
  const lock = (LOCK_CHOICES as readonly number[]).includes(Number(s.lockMinutes)) ? (Number(s.lockMinutes) as LockMinutes) : DEFAULT_LOCK_MINUTES;
  const g = s.generator;
  const length = Math.min(GENERATOR_MAX, Math.max(GENERATOR_MIN, Math.round(Number(g.length) || DEFAULT_GENERATOR.length)));
  return {
    lockMinutes: lock,
    inlineButton: s.inlineButton !== false,
    savePrompts: s.savePrompts !== false,
    copyTotp: s.copyTotp !== false,
    typeTotp: s.typeTotp !== false,
    showIcons: s.showIcons !== false,
    generator: { length, uppercase: g.uppercase !== false, numbers: g.numbers !== false, symbols: g.symbols !== false },
  };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = sanitize({ ...current, ...patch, generator: { ...current.generator, ...(patch.generator ?? {}) } });
  cache = next;
  await setLocal(LOCAL.settings, next);
  for (const fn of listeners) fn(next);
  return next;
}

export const lockMsOf = (s: Settings) => s.lockMinutes * 60 * 1000;

// ---- never-save list ----

export async function neverList(): Promise<string[]> {
  return (await getLocal<string[]>(LOCAL.never)) ?? [];
}

export async function isNever(site: string): Promise<boolean> {
  return (await neverList()).includes(site);
}

export async function addNever(site: string): Promise<void> {
  const list = await neverList();
  if (!list.includes(site)) await setLocal(LOCAL.never, [...list, site].sort());
}

export async function removeNever(site: string): Promise<string[]> {
  const list = (await neverList()).filter((s) => s !== site);
  await setLocal(LOCAL.never, list);
  return list;
}
