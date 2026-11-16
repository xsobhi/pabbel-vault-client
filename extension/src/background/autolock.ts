/**
 * Auto-lock. A worker timer would die with the worker, so the deadline is an
 * alarm, moved each time activity is recorded; when it fires it re-checks the
 * real idle time before locking. "On browser close" (0) needs no alarm at
 * all: storage.session, where the keys live, does not survive a restart.
 */
import { getLockMs, lastActivityAt, lock, onActivity, setLockMs, getKeys } from "./session";
import { getSettings, lockMsOf, onSettingsChange } from "./settings";

const ALARM = "pv.autolock";

async function schedule(from?: number): Promise<void> {
  const ms = getLockMs();
  await chrome.alarms.clear(ALARM);
  if (ms <= 0 || !(await getKeys())) return;
  const at = from ?? (await lastActivityAt()) ?? Date.now();
  await chrome.alarms.create(ALARM, { when: Math.max(Date.now() + 1000, at + ms) });
}

export async function checkIdle(): Promise<void> {
  const ms = getLockMs();
  if (ms <= 0) return;
  const idle = Date.now() - (await lastActivityAt());
  if (idle >= ms) await lock();
  else await schedule();
}

export function handleAutolockAlarm(name: string): boolean {
  if (name !== ALARM) return false;
  void checkIdle();
  return true;
}

export async function initAutolock(): Promise<void> {
  setLockMs(lockMsOf(await getSettings()));
  onActivity((at) => void schedule(at));
  onSettingsChange((s) => { setLockMs(lockMsOf(s)); void schedule(); });
  // A worker that wakes long after the deadline (machine asleep) locks before it serves anything.
  await checkIdle();
}

export const clearAutolock = () => chrome.alarms.clear(ALARM);
