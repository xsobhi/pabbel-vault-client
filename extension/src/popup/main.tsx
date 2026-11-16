import { render } from "preact";
import { applyDocumentLocale } from "../shared/i18n";
import { App } from "./app";

applyDocumentLocale();
// Opened as a window (from the in-page "Unlock" button) rather than as the toolbar popup.
if (new URLSearchParams(location.search).get("window")) document.documentElement.classList.add("as-window");
render(<App />, document.getElementById("app")!);
