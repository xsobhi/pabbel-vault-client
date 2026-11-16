/**
 * Words that give a field away, in the 31 languages Pabbel speaks (and the
 * English that sites use regardless). Matched against a field's name, id,
 * placeholder, aria-label, title and label text, lower-cased.
 *
 * Kept apart from the decision logic in classify.ts: these lists change as
 * sites are met in the wild; the order of the decisions almost never does.
 * Greek "κωδικός" is deliberately absent - it means both "code" and "password".
 */
const re = (parts: string[]) => new RegExp(parts.join("|"), "i");

/** Never a login, code or password field, whatever else it says. Checked first. */
export const EXCLUDE = re([
  "search", "query", "\\bq\\b", "captcha", "recaptcha", "zip", "postal", "post.?code", "postleit", "\\bplz\\b", "\\bcep\\b",
  "pocztow", "promo", "coupon", "voucher", "discount", "gift", "referr", "invit", "country.?code", "area.?code", "dial.?code",
  "card", "\\bcvv", "\\bcvc", "\\bcsc\\b", "\\bcc-", "iban", "swift", "routing", "account.?number", "tax", "\\bvat\\b",
  "street", "address.?line", "billing", "shipping", "delivery", "city", "amount", "quantity", "\\bqty\\b", "邮编", "郵便", "우편", "newsletter", "subscribe", "comment",
]);

export const USERNAME = re([
  "user", "login", "log-in", "sign.?in", "e-?mail", "\\bmail", "account", "\\bacct", "identifier", "\\bid\\b", "handle", "phone", "mobile",
  "benutzer", "anmelde", "nutzer", "usuario", "correo", "utilisateur", "identifiant", "courriel", "utente", "usuário", "utilizador",
  "gebruiker", "логин", "пользоват", "почт", "użytkownik", "kullanıcı", "e-posta", "uživatel", "användar", "e-post", "utilizator",
  "tên đăng nhập", "tài khoản", "pengguna", "surel", "akun", "اسم المستخدم", "البريد", "المستخدم", "نام کاربری", "ایمیل",
  "صارف", "ای میل", "उपयोगकर्ता", "ईमेल", "ব্যবহারকারী", "ইমেল", "பயனர்", "மின்னஞ்சல்", "ผู้ใช้", "อีเมล", "用户", "用戶", "帳號",
  "账号", "账户", "帳戶", "邮箱", "郵箱", "電子郵件", "ユーザー", "メール", "ログイン", "아이디", "사용자", "이메일", "χρήστη",
  "ηλεκτρονικ", "mtumiaji", "barua pepe",
]);

export const OTP = re([
  "one.?time", "\\botp", "totp", "\\b2fa", "\\bmfa", "two.?factor", "2.?step", "verification", "verify.?code", "security.?code",
  "auth(entication|enticator)?.?code", "passcode", "\\btoken", "sms.?code", "\\bcode\\b", "_code\\b", "code_", "\\bpin\\b",
  "einmal", "bestätigungs", "sicherheitscode", "zugangscode", "código", "codigo", "verificación", "verificação", "vérification",
  "code de", "codice", "verifica", "verificatie", "beveiligingscode", "код", "\\bkod", "doğrulama", "kód", "ověřovací",
  "verifierings", "\\bcod\\b", "mã xác", "mã otp", "mã bảo mật", "\\bkode", "رمز التحقق", "رمز", "التحقق", "کد", "تأیید", "کوڈ",
  "تصدیق", "कोड", "सत्यापन", "কোড", "যাচাই", "குறியீடு", "சரிபார்ப்பு", "รหัส", "ยืนยัน", "验证码", "驗證碼", "动态码", "動態碼",
  "安全码", "安全碼", "校验码", "確認コード", "認証コード", "ワンタイム", "セキュリティコード", "인증", "보안 코드", "인증번호",
  "επαλήθευσης", "msimbo", "uthibitisho",
]);

/** On a password field: this is the new one (sign-up, change) or its confirmation. */
export const NEW_PASSWORD = re([
  "new", "confirm", "repeat", "re-?type", "re-?enter", "again", "second", "create", "register", "sign.?up",
  "neue", "wiederhol", "bestätig", "nouveau", "nouvelle", "nuevo", "nueva", "repetir", "novo", "nova", "nuovo", "nuova", "ripeti",
  "nieuw", "herhaal", "новый", "подтверд", "повтор", "nowe", "powtórz", "yeni", "tekrar", "nové", "znovu", "nytt", "bekräfta",
  "upprepa", "nouă", "confirmă", "mới", "xác nhận", "baru", "ulangi", "konfirmasi", "الجديدة", "تأكيد", "جدید", "تکرار", "نیا",
  "नया", "पुष्टि", "নতুন", "নিশ্চিত", "புதிய", "உறுதி", "ใหม่", "新", "确认", "確認", "再入力", "새", "확인", "νέο", "επιβεβαίω",
  "mpya", "thibitisha",
]);

/** Form / page wording that says "this is a sign-in". */
export const LOGIN_CONTEXT = re([
  "log.?in", "sign.?in", "signin", "\\bauth", "session", "identifier", "account", "anmeld", "connexion", "iniciar", "entrar",
  "accedi", "inloggen", "войти", "вход", "zaloguj", "giriş", "přihlás", "logga in", "autentific", "đăng nhập", "masuk",
  "تسجيل الدخول", "ورود", "लॉग इन", "সাইন ইন", "உள்நுழை", "เข้าสู่ระบบ", "登录", "登入", "ログイン", "로그인", "σύνδεση", "ingia",
]);

/**
 * A button that SIGNS IN - the action words of LOGIN_CONTEXT, without its
 * broad ones ("account", "session", "auth") that a "Create account" button
 * also contains.
 */
export const SIGN_IN_ACTION = re([
  "log.?in", "sign.?in", "signin", "anmelden", "connexion", "se connecter", "iniciar sesi", "entrar", "accedi", "inloggen", "войти",
  "вход", "zaloguj", "giriş", "přihlás", "logga in", "đăng nhập", "masuk", "تسجيل الدخول", "ورود", "लॉग इन", "সাইন ইন",
  "உள்நுழை", "เข้าสู่ระบบ", "登录", "登入", "ログイン", "로그인", "σύνδεση", "ingia",
]);

export const SIGNUP_CONTEXT = re([
  "sign.?up", "register", "registration", "create.?account", "join", "inscri", "cadastr", "registr", "регистр", "зарегистр", "реєстр", "зареєстр", "zarejestr",
  "kayıt", "đăng ký", "daftar", "إنشاء حساب", "ثبت نام", "साइन अप", "নিবন্ধন", "பதிவு", "สมัคร", "注册", "註冊", "登録", "가입",
  "εγγραφή", "jisajili",
]);

/** A field that asks for an email address, not a user name or a phone number. */
export const EMAIL = re([
  "e-?mail", "\\bmail\\b", "correo", "courriel", "почт", "пошт", "e-posta", "e-post", "surel", "e-mel", "البريد", "ایمیل",
  "ای میل", "ईमेल", "ইমেল", "மின்னஞ்சல்", "อีเมล", "邮箱", "郵箱", "电子邮件", "電子郵件", "メール", "이메일", "ηλεκτρονικ",
  "barua pepe",
]);
