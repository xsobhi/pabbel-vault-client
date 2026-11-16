/**
 * The 2-step code page of a sign-in: an empty code field (one box, or a row of
 * one-digit boxes) showed up, so ask whether a password went in just before.
 * The worker answers with the current code, or nothing; the code is typed in,
 * never submitted, and never over anything the person already typed.
 */
import { t } from "../shared/i18n";
import { send } from "../shared/bridge";
import type { FillReply } from "../shared/messages";
import { allInputs, classOf, isVisible } from "./fields";
import { fillCode } from "./fill-dom";
import { otpTargetFor } from "./forms";
import { toast } from "./overlay";

const asked = new WeakSet<HTMLInputElement>();

/** The first empty, visible code target: one field, or a whole row of digit boxes. */
function emptyCodeTarget(again: boolean): HTMLInputElement[] | null {
  for (const i of allInputs()) {
    const cls = classOf(i);
    if ((cls !== "otp" && cls !== "otpDigit") || (!again && asked.has(i)) || !isVisible(i)) continue;
    const boxes = otpTargetFor(i);
    if (!boxes?.length || (cls === "otpDigit" && boxes.length < 4)) continue;
    if (boxes.every((b) => !b.value && isVisible(b))) return boxes;
  }
  return null;
}

/** One field takes the whole code (within its maxlength); digit boxes take one digit each, so the counts must agree. */
const fits = (boxes: HTMLInputElement[], code: string) =>
  boxes.length === 1 ? boxes[0].maxLength < 0 || code.length <= boxes[0].maxLength : boxes.length === code.length;

/**
 * `again` looks at fields already asked about: right after a password went in,
 * a code field that was on the page all along (one form with all three) counts.
 */
export async function offerCode(again = false): Promise<void> {
  const boxes = emptyCodeTarget(again);
  if (!boxes) return;
  for (const b of boxes) asked.add(b);
  const res = await send<FillReply | null>({ type: "cs:codeStep" }).catch(() => null);
  // The answer can take a few seconds (a fresh code): the person may have typed, or the page moved on.
  if (!res?.code || !fits(boxes, res.code) || boxes.some((b) => b.value || !isVisible(b))) return;
  if (fillCode(boxes[0], res.code)) toast(t("toastCodeFilled"), boxes[boxes.length - 1].getBoundingClientRect());
}

/** A login's password is now in a field: tell the worker, then look for a code field already waiting. */
export async function afterPasswordFill(id: string): Promise<void> {
  await send({ type: "cs:passwordFilled", id }).catch(() => {});
  await offerCode(true);
}
