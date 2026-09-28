/* ============================================================
 * POS Services — Shared Utilities
 * ============================================================
 * Escaping, keyboards, date/time conversion, CSV helpers, and
 * pagination. No side effects, no I/O.
 * ============================================================ */

/* ============================================================
 * HTML escaping
 * ============================================================ */

export const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

/* ============================================================
 * Labels (Persian) — shared across admin + user flows
 * ============================================================ */

export const statusFa = {
  pending: "⏳ در انتظار بررسی",
  reviewed: "✅ بررسی شده",
  cancelled: "❌ لغو شده",
};

export const problemFa = {
  PRINT: "🖨️ مشکل چاپ",
  ANTENNA: "📡 مشکل آنتن",
  CHARGER: "🔋 مشکل شارژر",
};

export const PROBLEM_TYPES = Object.keys(problemFa);

/* ============================================================
 * Field length caps (characters, not bytes)
 * ============================================================ */

export const MAX = {
  welcome: 3500,
  about: 2000,
  warranty: 3500,
  description: 2000,
  name: 50,
  company: 50,
  phone: 25,
  model: 50,
  telegramId: 25,
  applicant: 3500,
};

/* ============================================================
 * Error formatting
 * ============================================================ */

/**
 * Convert any thrown value into a short, log-safe string.
 * Never includes request payloads or user data — only the message
 * and the Telegram error code (when present).
 */
export function safeError(e) {
  if (!e) return "unknown error";
  const code = e.telegramCode ? `[${e.telegramCode}] ` : "";
  return code + String(e.message || e).slice(0, 200);
}

/* ============================================================
 * Keyboards
 * ============================================================ */

export function userMenu() {
  return {
    inline_keyboard: [
      [{ text: "💳 لیست انواع دستگاه‌های کارتخوان", callback_data: "u:devices" }],
      [{ text: "🛒 درخواست دستگاه کارتخوان", callback_data: "u:request" }],
      [{ text: "🛠️ پشتیبانی و تعمیرات", callback_data: "u:repair" }],
      [{ text: "🛡️ خدمات و گارانتی", callback_data: "u:warranty" }],
      [{ text: "📞 درباره‌ی ما - تماس با ما", callback_data: "u:about" }],
    ],
  };
}

export function userNavRow(backCallback = "u:home") {
  return [
    { text: "⬅️ بازگشت", callback_data: String(backCallback).slice(0, 64) },
    { text: "🏠 صفحه نخست", callback_data: "u:home" },
  ];
}

export function userHomeRow() {
  return [{ text: "🏠 صفحه نخست", callback_data: "u:home" }];
}

export function adminMenu(showRoleChooser = false) {
  const rows = [
    [{ text: "📊 آمار کلی درخواست‌ها", callback_data: "a:stats" }],
    [{ text: "🛒 درخواست‌های کارتخوان", callback_data: "a:pos" }],
    [{ text: "🛠️ درخواست‌های تعمیرات", callback_data: "a:repair" }],
    [{ text: "💳 مدیریت دستگاه‌ها", callback_data: "a:devices" }],
    [{ text: "⚙️ تنظیمات امنیتی", callback_data: "a:security" }],
    [{ text: "🎨 شخصی‌سازی", callback_data: "a:personal" }],
  ];
  if (showRoleChooser) {
    rows.push([{ text: "🔀 انتخاب نوع ورود", callback_data: "a:rolechooser" }]);
  }
  return { inline_keyboard: rows };
}

export function roleChooser() {
  return {
    inline_keyboard: [
      [{ text: "👤 ورود به عنوان کاربر", callback_data: "r:role:user" }],
      [{ text: "👑 ورود به عنوان Super Admin", callback_data: "r:role:admin" }],
    ],
  };
}

export function adminNavRow(backCallback = "a:home") {
  return [
    { text: "⬅️ بازگشت", callback_data: String(backCallback).slice(0, 64) },
    { text: "🏠 داشبورد مدیریت", callback_data: "a:home" },
  ];
}

export function adminHomeRow() {
  return [{ text: "🏠 داشبورد مدیریت", callback_data: "a:home" }];
}

/* ============================================================
 * Copy-to-clipboard buttons
 * ------------------------------------------------------------
 * Strip control characters and bidi marks that would corrupt
 * the copied value if pasted elsewhere.
 * ============================================================ */

function cleanCopyText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .trim()
    .slice(0, 256);
}

export function copyBtn(text, value) {
  return {
    text: String(text).slice(0, 64),
    copy_text: { text: cleanCopyText(value) },
  };
}

/* ============================================================
 * Text + phone validation
 * ============================================================ */

export function trimText(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export function hasPersianDigits(input) {
  return /[۰-۹٠-٩]/.test(String(input ?? ""));
}

/**
 * Accept only ASCII-digit phone numbers (with optional leading +).
 * Returns "" if the input is empty, contains Persian digits, or
 * fails the length check.
 */
export function normalizePhone(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (hasPersianDigits(s)) return "";
  const compact = s.replace(/[()\s-]/g, "");
  if (!/^\+?\d{7,20}$/.test(compact)) return "";
  return compact;
}

export function isCancelText(text) {
  return ["لغو", "انصراف", "/cancel", "cancel"].includes(
    String(text ?? "").trim().toLowerCase()
  );
}

/* ============================================================
 * CSV helpers
 * ============================================================ */

/**
 * Escape a single CSV cell.
 *
 * Formula injection guard: cells that begin with `=`, `+`, `-`,
 * `@`, tab, or carriage return are prefixed with a single quote,
 * so Excel / Google Sheets treat them as text.
 */
function csvCell(value) {
  let s = String(value ?? "");

  if (/^\s*[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }

  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells) {
  return cells.map(csvCell).join(",") + "\r\n";
}

/* ============================================================
 * Persian digits + Jalali (Shamsi) date helpers
 * ============================================================ */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function faDigits(input) {
  return String(input ?? "").replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * Gregorian → Jalali conversion.
 * Standard algorithm; no external dependency.
 */
function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

/**
 * Convert a SQLite UTC timestamp into a Tehran-localised Jalali
 * string. Example output: "۱۴۰۴/۰۷/۰۶ — ۱۴:۳۰".
 *
 * `opts.withTime === false` returns the date only.
 */
export function toJalali(sqliteDate, opts = {}) {
  if (!sqliteDate) return "";
  const s = String(sqliteDate).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return s;

  const utcMs = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] || 0)
  );
  const tehran = new Date(utcMs + (3 * 60 + 30) * 60 * 1000);

  const [jy, jm, jd] = gregorianToJalali(
    tehran.getUTCFullYear(),
    tehran.getUTCMonth() + 1,
    tehran.getUTCDate()
  );

  const jyStr = String(jy).padStart(4, "0");
  const jmStr = String(jm).padStart(2, "0");
  const jdStr = String(jd).padStart(2, "0");
  const hhStr = String(tehran.getUTCHours()).padStart(2, "0");
  const miStr = String(tehran.getUTCMinutes()).padStart(2, "0");

  const withTime = opts.withTime !== false;
  const out = withTime
    ? `${jyStr}/${jmStr}/${jdStr} — ${hhStr}:${miStr}`
    : `${jyStr}/${jmStr}/${jdStr}`;

  return faDigits(out);
}

/**
 * Human-readable "X minutes ago" in Persian. Falls back to an
 * empty string on unparseable input.
 */
export function timeAgo(sqliteDate) {
  if (!sqliteDate) return "";
  const s = String(sqliteDate).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return "";

  const utcMs = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] || 0)
  );

  const diffSec = Math.max(0, Math.floor((Date.now() - utcMs) / 1000));
  if (diffSec < 60) return "همین الان";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${faDigits(min)} دقیقه پیش`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${faDigits(hr)} ساعت پیش`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${faDigits(day)} روز پیش`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${faDigits(mon)} ماه پیش`;
  const yr = Math.floor(mon / 12);
  return `${faDigits(yr)} سال پیش`;
}

/**
 * Start of a Tehran-local day, `daysAgo` days in the past,
 * formatted as a SQLite-comparable UTC string.
 * Example: `tehranDayStartUtc(0)` → "2026-09-28 20:30:00".
 */
export function tehranDayStartUtc(daysAgo = 0) {
  const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;
  const nowMs = Date.now();
  const tehranMs = nowMs + TEHRAN_OFFSET_MS;
  const tehran = new Date(tehranMs);

  const startTehranMs = Date.UTC(
    tehran.getUTCFullYear(),
    tehran.getUTCMonth(),
    tehran.getUTCDate() - daysAgo
  );
  const startUtcMs = startTehranMs - TEHRAN_OFFSET_MS;
  const d = new Date(startUtcMs);

  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/* ============================================================
 * Pagination
 * ============================================================ */

export function safePage(page, totalPages) {
  const p = Number(page);
  const max = Math.max(1, Number(totalPages) || 1);
  if (!Number.isFinite(p) || p < 1) return 1;
  return Math.min(Math.floor(p), max);
}

/**
 * Build a single pagination keyboard row: [⏮️] [⬅️] [n/N] [➡️] [⏭️].
 * Empty when there is only one page.
 */
export function paginate(prefix, page, totalPages, noopCb = "n:noop") {
  if (totalPages <= 1) return [];

  const p = safePage(page, totalPages);
  const row = [];
  const showJump = totalPages > 3;

  if (showJump) {
    row.push(
      p > 1
        ? { text: "⏮️", callback_data: `${prefix}:p:1`.slice(0, 64) }
        : { text: "·", callback_data: noopCb }
    );
  }

  if (p > 1) {
    row.push({
      text: "⬅️ قبلی",
      callback_data: `${prefix}:p:${p - 1}`.slice(0, 64),
    });
  } else {
    row.push({ text: "·", callback_data: noopCb });
  }

  row.push({
    text: `${faDigits(p)}/${faDigits(totalPages)}`,
    callback_data: noopCb,
  });

  if (p < totalPages) {
    row.push({
      text: "➡️ بعدی",
      callback_data: `${prefix}:p:${p + 1}`.slice(0, 64),
    });
  } else {
    row.push({ text: "·", callback_data: noopCb });
  }

  if (showJump) {
    row.push(
      p < totalPages
        ? { text: "⏭️", callback_data: `${prefix}:p:${totalPages}`.slice(0, 64) }
        : { text: "·", callback_data: noopCb }
    );
  }

  return [row];
}
