/** The extension's version, from package.json. */
declare const __PV_VERSION__: string;

declare module "*.dat" {
  const text: string;
  export default text;
}
/** Which browser this bundle was built for. */
declare const __PV_TARGET__: "chrome" | "firefox";
