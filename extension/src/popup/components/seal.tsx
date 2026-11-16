import { useState } from "preact/hooks";
import type { ItemType } from "../../shared/items";
import { Icon } from "./icon";

/** The site's icon when we have one; else the first letter in the display face, or a glyph for codes and notes. */
export function Seal({ name, type, size = "md", image }: { name: string; type: ItemType; size?: "md" | "lg"; image?: string }) {
  const [unusable, setUnusable] = useState(false);
  if (image && !unusable) {
    return <span class={`seal seal-${size} seal-image`} aria-hidden="true"><img src={image} alt="" onError={() => setUnusable(true)} /></span>;
  }
  const letter = (name.trim().match(/\p{L}|\p{N}/u)?.[0] ?? "•").toUpperCase();
  return (
    <span class={`seal seal-${size} seal-${type}`} aria-hidden="true">
      {type === "login" ? letter : <Icon name={type === "totp" ? "clock" : "sticky-note"} size={size === "lg" ? 22 : 16} />}
    </span>
  );
}
