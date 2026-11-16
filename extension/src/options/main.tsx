import { render } from "preact";
import { applyDocumentLocale, t } from "../shared/i18n";
import { OptionsApp } from "./options-app";

applyDocumentLocale();
document.title = `${t("optionsTitle")} - ${t("brandShort")}`;
render(<OptionsApp />, document.getElementById("app")!);
