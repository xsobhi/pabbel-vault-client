// Which forms count as a sign-up when they have a CURRENT-password field: only
// those whose own submit buttons all say "sign up" and none says "sign in".
import { describe, expect, it } from "vitest";
import { submitSaysSignUp } from "../../src/content/signup";

describe("submitSaysSignUp", () => {
  it.each([
    [["Create account"], true],
    [["Sign up"], true],
    [["Join now"], true],
    [["Registrieren"], true],
    [["Créer un compte"], false], // no sign-up word the patterns know: no mask, the safe side
    [["Зарегистрироваться"], true],
    [["Зареєструватися"], true],
    [["立即注册"], true],
    [["会員登録"], true],
  ])("%j -> %s", (labels, want) => expect(submitSaysSignUp(labels as string[])).toBe(want));

  it.each([
    // A "Sign in" form with a "Create account" button beside its submit (review finding).
    [["Sign in", "Create account"], false],
    // A sign-in under "<h1>Join 2 million readers</h1>": the heading is never read, only the button.
    [["Sign in"], false],
    [["Sign up or log in"], false],
    [["Rejoin"], false],
    [["Continue"], false],
    [["Anmelden"], false],
    [["注册 / 登录"], false],
    [[], false],
  ])("%j -> %s", (labels, want) => expect(submitSaysSignUp(labels as string[])).toBe(want));
});
