import { useEffect, useState } from "preact/hooks";

type Listener = (text: string) => void;
const listeners = new Set<Listener>();

/** Show a short confirmation at the bottom of the popup ("Password copied"). */
export function toast(text: string): void {
  for (const l of listeners) l(text);
}

export function Toaster() {
  const [text, setText] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const l: Listener = (t) => { setText(t); setN((x) => x + 1); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  useEffect(() => {
    if (!text) return;
    const id = setTimeout(() => setText(null), 2200);
    return () => clearTimeout(id);
  }, [n]);
  return text ? <div class="toast" role="status" key={n}>{text}</div> : null;
}
