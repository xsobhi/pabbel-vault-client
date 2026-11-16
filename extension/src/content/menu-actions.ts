/**
 * What happens when the dropdown opens and when a row is picked. Picking is
 * the only moment a secret crosses into the page: the worker re-checks the
 * frame and the item's site, and answers with that one item's fields.
 */
import { send } from "../shared/bridge";
import { t } from "../shared/i18n";
import type { FieldKind, FillReply, InlineItem, ListReply } from "../shared/messages";
import { afterPasswordFill } from "./code-step";
import { fillCode, fillLogin, fillNewPassword, setValue } from "./fill-dom";
import { closeMenu, menuOpen, showFailed, showLoading, showMenu } from "./menu";
import { toast } from "./overlay";
import { pageNames } from "./page-hints";
import { isSignupEmail } from "./signup";
import type { NewMaskReply } from "../shared/masks";

const siteLabel = () => location.hostname.replace(/^www\./, "");

/** A worker that has to start, or a first load on a slow line, must not leave the skeleton up for ever. */
const LIST_TIMEOUT_MS = 8000;

let opening = 0;

export async function openFor(field: HTMLInputElement, kind: FieldKind): Promise<void> {
  const ticket = ++opening;
  showLoading(field, siteLabel());
  const signup = kind === "login" && isSignupEmail(field);
  const answer = send<ListReply>({ type: "cs:list", kind, signup }).catch(() => null);
  const late = new Promise<null>((r) => setTimeout(() => r(null), LIST_TIMEOUT_MS));
  const reply = await Promise.race([answer, late]);
  if (ticket !== opening || !menuOpen()) return; // closed, or opened again, while it loaded
  if (!reply) { showFailed(field, siteLabel(), () => void openFor(field, kind)); return; }
  if (!reply.allowed) { closeMenu(); return; }
  showMenu(field, kind, reply, siteLabel(), {
    pick: (item) => void pick(field, item),
    generate: () => void generate(field),
    useMask: (address) => { closeMenu(); setValue(field, address); },
    newMask: () => void newMask(field),
    openPopup: () => { closeMenu(); void send({ type: "cs:openPopup" }).catch(() => {}); },
  });
}

export async function pick(field: HTMLInputElement, item: InlineItem): Promise<void> {
  closeMenu();
  const res = await send<FillReply>({ type: "cs:fill", id: item.id }).catch(() => null);
  if (!res || res.error) return;
  const done = applyFill(field, res);
  if (done.awaitPassword) void send({ type: "cs:awaitPassword", id: item.id }).catch(() => {});
  else if (done.password) void afterPasswordFill(item.id);
}

/** Shared by picks and by the worker's shortcut/context-menu fills. `password`: a password went in. */
export function applyFill(field: HTMLInputElement | null, res: FillReply): { filled: boolean; awaitPassword: boolean; password: boolean } {
  let filled = false;
  let awaitPassword = false;
  let password = false;
  if (res.username !== undefined || res.password !== undefined) {
    const placed = fillLogin(field, res.username, res.password);
    filled = placed.username || placed.password;
    password = placed.password;
    awaitPassword = placed.username && !placed.password && !!res.password; // the first page of a two-page sign-in
  } else if (res.code) filled = fillCode(field, res.code);
  if (filled && res.codeCopied && !awaitPassword) toast(t("toastCodeCopied"), field?.getBoundingClientRect() ?? null);
  return { filled, awaitPassword, password };
}

async function generate(field: HTMLInputElement): Promise<void> {
  closeMenu();
  const res = await send<{ password?: string }>({ type: "cs:generate" }).catch(() => null);
  if (res?.password && fillNewPassword(field, res.password)) toast(t("toastGenerated"), field.getBoundingClientRect());
}

/** "Use a new email mask": the worker makes one named after the site; it goes into this very field. */
async function newMask(field: HTMLInputElement): Promise<void> {
  closeMenu();
  const res = await send<NewMaskReply>({ type: "cs:createMask", names: pageNames() }).catch(() => ({ error: "failed" as const }));
  const at = field.getBoundingClientRect();
  if ("address" in res) {
    setValue(field, res.address);
    toast(t("toastMaskFilled"), at);
  } else toast(t(res.error === "rate" ? "inlineMaskLimit" : "inlineMaskFailed"), at);
}
