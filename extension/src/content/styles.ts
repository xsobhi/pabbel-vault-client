/**
 * Styles for everything drawn inside web pages. They live in a closed shadow
 * root, so the page's CSS cannot reach in and ours cannot leak out; `:host`
 * is reset with `all: initial` so inherited page styles do not either.
 * System fonts only - loading our own would mean exposing the font files to
 * every page (web_accessible_resources), which also lets pages fingerprint
 * the extension. Light and dark follow the person's system setting.
 */
export const CSS = `
:host { all: initial !important; position: fixed !important; inset: 0 auto auto 0 !important; width: 0 !important; height: 0 !important;
  z-index: 2147483647 !important; display: block !important; contain: style !important; }
* { box-sizing: border-box; }
.ui { --paper:#fffdf8; --ink:#1c1917; --muted:#78716c; --line:rgba(28,25,23,.09); --soft:#f5f1e8; --tint:#f6e9dc; --tint-ink:#7c3a16; --accent:#e0612a; --on-accent:#fffaf5;
  --shadow: 0 0 0 .5px rgba(28,25,23,.1), 0 2px 6px rgba(28,25,23,.06), 0 18px 44px -12px rgba(28,25,23,.3);
  font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif;
  color: var(--ink); -webkit-font-smoothing: antialiased; }
@media (prefers-color-scheme: dark) { .ui { --paper:#201d15; --ink:#f5f1e6; --muted:#a8a29e; --line:rgba(245,241,230,.1); --soft:#2a261b; --tint:#33271c; --tint-ink:#f7c9a6;
  --accent:#f2884b; --on-accent:#1c1917; --shadow: 0 0 0 .5px rgba(245,241,230,.14), 0 18px 44px -12px rgba(0,0,0,.7); } }
button { font: inherit; color: inherit; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.btn-field { position: fixed; width: 22px; height: 22px; padding: 0; margin: 0; border: 0; border-radius: 6px; cursor: pointer; background: transparent;
  display: grid; place-items: center; opacity: .92; transition: transform .12s ease-out, opacity .12s ease-out; }
.btn-field:hover { transform: scale(1.08); opacity: 1; }
.btn-field svg { width: 20px; height: 20px; display: block; filter: drop-shadow(0 1px 1.5px rgba(28,25,23,.25)); }

.menu { position: fixed; width: 304px; max-height: 320px; overflow: hidden; display: flex; flex-direction: column; background: var(--paper);
  border-radius: 14px; box-shadow: var(--shadow); animation: rise .12s ease-out; }
.menu-head { display: flex; align-items: center; gap: 7px; padding: 9px 12px 7px; }
.menu-head svg { width: 15px; height: 15px; flex: none; }
.brand { font-size: 11.5px; font-weight: 600; color: var(--ink); }
.host { margin-inline-start: auto; font-size: 11px; color: var(--muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rows { overflow-y: auto; padding: 0 5px 5px; }
.row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 7px; border: 0; border-radius: 9px; background: transparent; text-align: start; cursor: pointer; }
.row:hover, .row[aria-selected="true"] { background: var(--soft); }
.seal { width: 30px; height: 30px; flex: none; border-radius: 8px; display: grid; place-items: center; overflow: hidden; background: var(--tint); color: var(--tint-ink);
  font: 600 14px/1 Georgia, "Times New Roman", serif; }
.seal svg { width: 15px; height: 15px; }
.seal:has(img), .tile:has(img) { background: #fff; box-shadow: inset 0 0 0 .5px rgba(28,25,23,.12); }
.seal img { width: 22px; height: 22px; object-fit: contain; display: block; }
.txt { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note { padding: 6px 9px 9px; color: var(--muted); font-size: 12.5px; }
.gate-row .name { white-space: normal; font-weight: 500; }
.gate-row .seal { background: var(--soft); color: var(--muted); }
.pill { flex: none; padding: 5px 11px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 600; line-height: 1.2; transition: filter .12s ease-out; }
.gate-row:hover .pill { filter: brightness(1.07); }
.skel { display: flex; align-items: center; gap: 10px; padding: 6px 7px; }
.skel i { display: block; border-radius: 6px; background: linear-gradient(90deg, var(--soft) 30%, var(--tint) 50%, var(--soft) 70%); background-size: 220% 100%; animation: shimmer 1.1s linear infinite; }
.skel-seal { width: 30px; height: 30px; flex: none; border-radius: 8px !important; }
.skel-txt { flex: 1; display: grid; gap: 6px; }
.skel-a { height: 10px; width: 58%; }
.skel-b { height: 8px; width: 82%; }

.bar { position: fixed; top: 12px; inset-inline-end: 12px; width: 316px; padding: 11px 11px 10px; background: var(--paper); border-radius: 15px; box-shadow: var(--shadow);
  animation: drop .24s cubic-bezier(.2,.8,.2,1); }
.bar-top { display: flex; gap: 11px; align-items: center; }
.tile { position: relative; width: 36px; height: 36px; flex: none; border-radius: 10px; display: grid; place-items: center; background: var(--tint); color: var(--tint-ink);
  font: 600 16px/1 Georgia, "Times New Roman", serif; }
.tile img { width: 26px; height: 26px; object-fit: contain; display: block; }
.tile-mark { position: absolute; inset-block-end: -4px; inset-inline-end: -4px; width: 16px; height: 16px; border-radius: 5px; box-shadow: 0 0 0 2px var(--paper); overflow: hidden; }
.tile-mark svg { width: 16px; height: 16px; display: block; }
.bar-text { min-width: 0; flex: 1; }
.bar h2 { margin: 0; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--ink); }
.who { margin: 1px 0 0; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.x { flex: none; align-self: flex-start; width: 24px; height: 24px; padding: 4px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer; }
.x svg { width: 16px; height: 16px; display: block; }
.x:hover { background: var(--soft); color: var(--ink); }
.actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.bar select { min-width: 0; max-width: 110px; height: 30px; padding: 0 6px; border: 0; border-radius: 8px; background: var(--soft); color: var(--ink); font: inherit; font-size: 12px; }
.quiet { margin-inline-end: auto; padding: 4px 2px; border: 0; background: none; color: var(--muted); font-size: 12px; cursor: pointer; }
.quiet:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }
.primary { flex: none; height: 30px; padding: 0 16px; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent); font-size: 12.5px; font-weight: 600; cursor: pointer; transition: filter .12s ease-out; }
.primary:hover { filter: brightness(1.07); }
.primary.is-busy { opacity: .65; cursor: default; }
.bar.is-done { width: auto; display: flex; align-items: center; gap: 8px; padding: 7px 14px 7px 8px; border-radius: 999px; font-weight: 600; font-size: 12.5px; animation: pop .22s cubic-bezier(.2,.9,.3,1.25); }
.bar.is-leaving { opacity: 0; transform: translateY(-6px); transition: opacity .18s ease-in, transform .18s ease-in; }
.tick { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); }
.tick svg { width: 13px; height: 13px; stroke-width: 3; stroke-dasharray: 24; animation: draw .3s .06s ease-out both; }
.toast { position: fixed; padding: 6px 11px; border-radius: 999px; background: var(--ink); color: var(--paper); font-size: 12px; font-weight: 600;
  box-shadow: var(--shadow); animation: rise .14s ease-out; }
@keyframes rise { from { opacity: 0; transform: translateY(4px); } }
@keyframes drop { from { opacity: 0; transform: translateY(-8px); } }
@keyframes pop { from { opacity: 0; transform: scale(.9); } }
@keyframes draw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
@keyframes shimmer { to { background-position: -220% 0; } }
@media (prefers-reduced-motion: reduce) { .menu, .bar, .toast, .skel i, .tick svg { animation: none; } .btn-field { transition: none; } }
`;
