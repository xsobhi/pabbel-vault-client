/**
 * Write text (or nothing) to the clipboard from a document that is not
 * focused - an offscreen document in Chrome, the event page in Firefox.
 * navigator.clipboard needs focus there; a copy command whose `copy` event
 * we answer ourselves does not, and can also write the empty string, which a
 * selected-textarea copy cannot.
 */
export function writeWithCopyEvent(doc: Document, text: string): boolean {
  const onCopy = (e: ClipboardEvent) => {
    e.preventDefault();
    e.clipboardData?.setData("text/plain", text);
  };
  doc.addEventListener("copy", onCopy, true);
  try {
    return doc.execCommand("copy");
  } finally {
    doc.removeEventListener("copy", onCopy, true);
  }
}
