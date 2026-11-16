// Field heuristics: autocomplete first, then type, then words - in several languages.
import { describe, expect, it } from "vitest";
import { classify, emailish, strongIdentifier, type FieldDesc } from "../../src/content/classify";

const f = (p: Partial<FieldDesc>): FieldDesc => ({
  type: "text", name: "", id: "", autocomplete: "", placeholder: "", ariaLabel: "", label: "", inputMode: "", maxLength: -1, pattern: "", wasPassword: false, ...p,
});

describe("autocomplete tokens win", () => {
  it.each([
    [{ autocomplete: "one-time-code" }, "otp"],
    [{ autocomplete: "one-time-code", maxLength: 1 }, "otpDigit"],
    [{ type: "password", autocomplete: "new-password" }, "newPassword"],
    [{ type: "password", autocomplete: "current-password", name: "new" }, "password"],
    [{ autocomplete: "username" }, "username"],
    [{ type: "email", autocomplete: "email" }, "username"],
  ])("%j -> %s", (p, want) => expect(classify(f(p))).toBe(want));
});

describe("password fields", () => {
  it.each([
    [{ type: "password", name: "password" }, "password"],
    [{ type: "password", name: "pass", label: "Confirm password" }, "newPassword"],
    [{ type: "password", label: "Neues Passwort" }, "newPassword"],
    [{ type: "password", label: "Подтвердите пароль" }, "newPassword"],
    [{ type: "password", label: "确认密码" }, "newPassword"],
    [{ type: "text", name: "pw", wasPassword: true }, "password"],
    [{ type: "password", name: "otc", label: "Verification code", maxLength: 6 }, "otp"],
  ])("%j -> %s", (p, want) => expect(classify(f(p))).toBe(want));
});

describe("usernames without autocomplete", () => {
  it.each([
    [{ name: "login" }, "username"],
    [{ type: "email" }, "username"],
    [{ placeholder: "E-Mail-Adresse" }, "username"],
    [{ label: "Nom d'utilisateur" }, "username"],
    [{ label: "Usuario o correo" }, "username"],
    [{ label: "Имя пользователя" }, "username"],
    [{ label: "用户名" }, "username"],
    [{ label: "メールアドレス" }, "username"],
    [{ label: "아이디" }, "username"],
    [{ label: "اسم المستخدم" }, "username"],
    [{ label: "Kullanıcı adı" }, "username"],
    [{ type: "email", label: "Email address" }, "username"],
    [{ label: "Email address" }, "username"],
    [{ type: "email", autocomplete: "username webauthn", label: "Email address" }, "username"],
  ])("%j -> %s", (p, want) => expect(classify(f(p))).toBe(want));
});

describe("2-step code fields without autocomplete", () => {
  it.each([
    [{ name: "otp", maxLength: 6 }, "otp"],
    [{ name: "code", inputMode: "numeric", maxLength: 6 }, "otp"],
    [{ label: "Authentication code" }, "otp"],
    [{ label: "Bestätigungscode" }, "otp"],
    [{ label: "Code de vérification" }, "otp"],
    [{ label: "Código de verificación" }, "otp"],
    [{ label: "Код подтверждения" }, "otp"],
    [{ label: "验证码" }, "otp"],
    [{ label: "認証コード" }, "otp"],
    [{ label: "인증번호" }, "otp"],
    [{ label: "رمز التحقق" }, "otp"],
    [{ label: "Mã xác minh" }, "otp"],
    [{ ariaLabel: "Digit 1", maxLength: 1, inputMode: "numeric" }, "otpDigit"],
    [{ maxLength: 1, type: "tel" }, "otpDigit"],
    [{ inputMode: "numeric", maxLength: 6 }, "otp"],
  ])("%j -> %s", (p, want) => expect(classify(f(p))).toBe(want));
});

describe("things that are not sign-in fields", () => {
  it.each([
    [{ type: "search", name: "q" }],
    [{ name: "q" }],
    [{ label: "ZIP code", maxLength: 5, inputMode: "numeric" }],
    [{ label: "Postal code" }],
    [{ label: "Promo code" }],
    [{ label: "Card security code", maxLength: 4 }],
    [{ name: "cvc", maxLength: 3 }],
    [{ label: "Código postal" }],
    [{ type: "checkbox", name: "remember" }],
    [{ type: "hidden", name: "csrf_token" }],
    [{ label: "Street address" }],
    [{ label: "Billing address" }],
    [{ name: "address_line1" }],
  ])("%j -> null", (p) => expect(classify(f(p))).toBeNull());
});

describe("strong identifiers (two-step sign-in, first page)", () => {
  it("says yes to username/login words and no to a bare email box", () => {
    expect(strongIdentifier(f({ name: "username" }))).toBe(true);
    expect(strongIdentifier(f({ autocomplete: "username webauthn" }))).toBe(true);
    expect(strongIdentifier(f({ name: "newsletter_email", type: "email" }))).toBe(false);
  });
});

describe("email fields (where an email mask may go)", () => {
  it.each([
    [{ type: "email" }, true],
    [{ autocomplete: "email" }, true],
    [{ autocomplete: "username", label: "Email address" }, true],
    [{ name: "correo" }, true],
    [{ placeholder: "Adresse e-mail" }, true],
    [{ label: "Электронная почта" }, true],
    [{ label: "メールアドレス" }, true],
    [{ label: "البريد الإلكتروني" }, true],
    [{ name: "username" }, false],
    [{ type: "tel", label: "Phone" }, false],
    [{ autocomplete: "tel", label: "Mobile or email" }, false],
    [{ name: "gmail_password_hint" }, false],
  ])("%j -> %s", (p, want) => expect(emailish(f(p))).toBe(want));
});
