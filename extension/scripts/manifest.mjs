// The manifest for each target, from one description. The store build must
// never carry `key` (scripts/check-store.mjs enforces it); only the --local build
// pins the extension id - to the store item's own public key, so a local
// unpacked copy has the same id and the same OAuth redirect URI as the store.
// The key is public (it is inside every installed copy and the id is derived from it).
import { readFileSync } from "node:fs";

const PAGES = ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"];
// `https:` for the one thing that talks to other sites: the worker asking a saved site for its icon (background/icon-fetch.ts).
const API_ORIGINS = ["https:"];

function csp() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${API_ORIGINS.join(" ")}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** The store item's public key, base64 DER on one line (scripts/store-public-key.pem). */
function devKey() {
  const pem = readFileSync(new URL("./store-public-key.pem", import.meta.url), "utf8");
  return pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

export function manifestFor({ target, local, version }) {
  const icons = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };
  const m = {
    manifest_version: 3,
    name: "__MSG_extName__",
    short_name: "__MSG_extShortName__",
    description: "__MSG_extDescription__",
    version,
    default_locale: "en",
    homepage_url: "https://pabbel.com/vault",
    icons,
    action: { default_popup: "popup.html", default_title: "__MSG_extName__", default_icon: { 16: icons[16], 32: icons[32] } },
    permissions: ["storage", "identity", "alarms", "contextMenus", "clipboardWrite", "activeTab"],
    host_permissions: PAGES,
    content_scripts: [{ matches: PAGES, js: ["content.js"], all_frames: true, run_at: "document_idle" }],
    options_ui: { page: "options.html", open_in_tab: true },
    commands: {
      _execute_action: { suggested_key: { default: "Ctrl+Shift+Y", mac: "Command+Shift+Y" } },
      "fill-login": { suggested_key: { default: "Ctrl+Shift+L", mac: "Command+Shift+L" }, description: "__MSG_commandFillLogin__" },
    },
    content_security_policy: { extension_pages: csp() },
  };
  if (target === "chrome") {
    m.minimum_chrome_version = "120";
    m.background = { service_worker: "background.js" };
    m.permissions.push("offscreen");
    if (local) m.key = devKey();
  } else {
    // Firefox MV3 has no service worker: the same bundle runs as a non-persistent event page.
    m.background = { scripts: ["background.js"] };
    m.browser_specific_settings = {
      gecko: {
        id: "vault@pabbel.com",
        // 140 = the current ESR, and the first release that reads data_collection_permissions.
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["authenticationInfo"] },
      },
      gecko_android: { strict_min_version: "142.0" },
    };
  }
  return m;
}
