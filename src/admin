/* ============================================================
 * POS Services — Admin Flows
 * ============================================================
 * Handles the admin dashboard, request triage, device management,
 * personalization screens, security panel, and audit log.
 * ============================================================ */

import {
  all,
  one,
  run,
  sessionClear,
  sessionGet,
  sessionSet,
} from "./db.js";
import {
  btn,
  clonePhotoToRepo,
  kb,
  renderScreen,
  sendDocumentFromString,
  tg,
} from "./telegram.js";
import { audit, isSuperAdmin } from "./auth.js";
import {
  MAX,
  PROBLEM_TYPES,
  adminHomeRow,
  adminNavRow,
  copyBtn,
  esc,
  faDigits,
  isCancelText,
  paginate,
  problemFa,
  roleChooser,
  safeError,
  safePage,
  statusFa,
  tehranDayStartUtc,
  timeAgo,
  toJalali,
  trimText,
  adminMenu as utilAdminMenu,
} from "./utils.js";

/* ============================================================
 * Constants
 * ============================================================ */

const TABLES = { pos: "pos_requests", repair: "repair_requests" };
const PAGE_SIZE = 8;
const DEVICES_PAGE_SIZE = 8;
const LOGINS_PAGE_SIZE = 10;
const AUDIT_PAGE_SIZE = 5;

/* MAX_ADMINS counts only rows in the `admins` table. The Super
 * Admin is defined by the SUPER_ADMIN_ID secret and is NOT stored
 * in that table, so the effective total is MAX_ADMINS + 1. */
const MAX_ADMINS = 9;

/* Hard cap on rows per in-bot CSV export. Keeps us comfortably
 * within the Cloudflare Workers free-plan CPU budget (10ms). */
const CSV_MAX_ROWS = 250;

const CSV_DATE_RANGES = {
  today: { label: "📅 امروز", days: 0 },
  "7d": { label: "📅 ۷ روز اخیر", days: 6 },
  "30d": { label: "📅 ۳۰ روز اخیر", days: 29 },
  all: { label: "📅 همه (۲۵۰ ردیف آخر)", days: null },
};

const REQUEST_STATUSES = ["pending", "reviewed", "cancelled"];

/* Emoji-less status labels for use inside <b> tags. */
const STATUS_FA_PLAIN = {
  pending: "در انتظار بررسی",
  reviewed: "بررسی شده",
  cancelled: "لغو شده",
};
const STATUS_EMOJI = {
  pending: "⏳",
  reviewed: "✅",
  cancelled: "❌",
};

const ALLOWED_SETTINGS_FIELDS = new Set([
  "welcome_message",
  "about_contact_description",
  "new_warranty",
  "used_warranty",
  "intro_legal",
  "note_iranian",
  "note_foreign",
]);

/* ============================================================
 * Small helpers
 * ============================================================ */

function backHome() {
  return kb([adminHomeRow()]);
}

function fireAndForget(ctx, promise) {
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(promise);
  } else {
    promise.catch((e) => console.error("async task failed:", safeError(e)));
  }
}

/**
 * Send a plain message and return its message_id (or null on error).
 * Callers that need to delete the message afterwards should capture
 * the return value.
 */
async function toast(env, chat, text, keyboard = null) {
  try {
    const r = await tg(env, "sendMessage", {
      chat_id: chat,
      text,
      parse_mode: "HTML",
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
    return r?.message_id || null;
  } catch (e) {
    console.error("toast failed:", safeError(e));
    return null;
  }
}

async function deleteMsg(env, chat, msgId) {
  if (!msgId) return;
  try {
    await tg(env, "deleteMessage", { chat_id: chat, message_id: msgId });
  } catch { /* ignore */ }
}

async function deleteUserMsg(env, chat, msgId) {
  return deleteMsg(env, chat, msgId);
}

function parsePage(raw) {
  const s = String(raw ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : 1;
}

function filterSuffix(filterType, filterValue) {
  if (filterType === "s" && filterValue) return `:s:${filterValue}`;
  if (filterType === "q") return ":q";
  return ":all";
}

function backToList(kind, page, filterType, filterValue) {
  const p = Number(page) || 1;
  if (filterType === "s" && filterValue) {
    return p > 1 ? `a:${kind}:s:${filterValue}:p:${p}` : `a:${kind}:s:${filterValue}`;
  }
  if (filterType === "q") {
    return `a:${kind}:search:p:${p}`;
  }
  return p > 1 ? `a:${kind}:p:${p}` : `a:${kind}`;
}

/* ============================================================
 * Screen helper — auto-prepends opts.notice
 * ============================================================ */

async function adminAnswer(env, chat, text, keyboard, opts = {}, withImage = false) {
  const notice = opts.notice ? `${opts.notice}\n\n` : "";
  const finalText = notice + String(text);

  let imageFileId = null;
  if (opts.imageFileId !== undefined) {
    imageFileId = opts.imageFileId || null;
  } else if (withImage) {
    const s = await one(
      env.DB,
      "SELECT admin_welcome_image_file_id FROM settings WHERE id=1"
    );
    imageFileId = s?.admin_welcome_image_file_id || null;
  }
  return renderScreen(env, chat, finalText, keyboard, opts, imageFileId);
}

function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => `\\${c}`);
}

function buildPosSearchConditions(query) {
  const q = String(query || "").trim();
  if (!q) return { conditions: [], args: [] };

  const like = `%${escapeLike(q)}%`;
  const parts = [
    "full_name LIKE ? ESCAPE '\\'",
    "company_name LIKE ? ESCAPE '\\'",
    "phone_number LIKE ? ESCAPE '\\'",
    "device_model LIKE ? ESCAPE '\\'",
  ];
  const args = [like, like, like, like];
  return { conditions: [`(${parts.join(" OR ")})`], args };
}

function buildRepairSearchConditions(query) {
  const q = String(query || "").trim();
  if (!q) return { conditions: [], args: [] };

  const like = `%${escapeLike(q)}%`;
  const parts = [
    "r.full_name LIKE ? ESCAPE '\\'",
    "r.phone_number LIKE ? ESCAPE '\\'",
    "d.model LIKE ? ESCAPE '\\'",
  ];
  const args = [like, like, like];
  return { conditions: [`(${parts.join(" OR ")})`], args };
}

/* ============================================================
 * CSV helpers (in-bot exports only)
 * ============================================================ */

function csvEscape(value) {
  let s = String(value ?? "");
  // Prevent CSV formula injection in Excel / Sheets.
  if (/^\s*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(cells) {
  return cells.map(csvEscape).join(",") + "\r\n";
}

function dateRangeStart(rangeKey) {
  const r = CSV_DATE_RANGES[rangeKey];
  if (!r || r.days === null) return null;
  return tehranDayStartUtc(r.days);
}

async function buildPosCsv(env, rangeKey) {
  const since = dateRangeStart(rangeKey);
  const where = since ? "WHERE created_at >= ?" : "";
  const args = since ? [since] : [];

  const rows = await all(
    env.DB,
    `SELECT id,telegram_user_id,device_model,applicant_type,nationality,
            full_name,company_name,phone_number,description,status,created_at,updated_at
     FROM pos_requests
     ${where}
     ORDER BY id DESC
     LIMIT ?`,
    ...args, CSV_MAX_ROWS
  );

  let out = "\uFEFF";
  out += csvLine([
    "id","telegram_user_id","device_model","applicant_type","nationality",
    "full_name","company_name","phone_number","description","status","created_at","updated_at",
  ]);
  for (const r of rows) {
    out += csvLine([
      r.id, r.telegram_user_id, r.device_model, r.applicant_type, r.nationality || "",
      r.full_name || "", r.company_name || "", r.phone_number || "", r.description || "",
      r.status, r.created_at, r.updated_at,
    ]);
  }

  return { csv: out, count: rows.length, hitLimit: rows.length === CSV_MAX_ROWS };
}

async function buildRepairCsv(env, rangeKey) {
  const since = dateRangeStart(rangeKey);
  const where = since ? "WHERE r.created_at >= ?" : "";
  const args = since ? [since] : [];

  const rows = await all(
    env.DB,
    `SELECT r.id,r.telegram_user_id,d.model AS device_model,r.problem_type,
            r.full_name,r.phone_number,r.description,r.status,r.created_at,r.updated_at
     FROM repair_requests r
     LEFT JOIN devices d ON d.id = r.device_id
     ${where}
     ORDER BY r.id DESC
     LIMIT ?`,
    ...args, CSV_MAX_ROWS
  );

  let out = "\uFEFF";
  out += csvLine([
    "id","telegram_user_id","device_model","problem_type","full_name",
    "phone_number","description","status","created_at","updated_at",
  ]);
  for (const r of rows) {
    out += csvLine([
      r.id, r.telegram_user_id, r.device_model, r.problem_type, r.full_name || "",
      r.phone_number || "", r.description || "", r.status, r.created_at, r.updated_at,
    ]);
  }

  return { csv: out, count: rows.length, hitLimit: rows.length === CSV_MAX_ROWS };
}

/* ============================================================
 * Dashboard
 * ============================================================ */

export async function adminStart(env, chat, role = null, opts = {}) {
  const adminId = String(role?.telegram_id || chat);
  await sessionClear(env.DB, adminId);
  const showRoleChooser = Boolean(role) && isSuperAdmin(env, role.telegram_id);
  return adminAnswer(
    env, chat,
    "🏠 <b>داشبورد مدیریت</b>",
    utilAdminMenu(showRoleChooser),
    opts, true
  );
}

/* ============================================================
 * Contact block
 * ============================================================ */

function buildContactFields({ phone, username, uid }) {
  const textLines = [];
  const buttonRows = [];

  const p = String(phone || "").trim();
  if (p) {
    textLines.push(`📞 <b>شماره تلفن:</b> <code>${esc(p)}</code>`);
    buttonRows.push([copyBtn("📱 شماره تلفن", p)]);
  }

  const u = String(uid || "").trim();
  if (u) {
    textLines.push(`🪪 <b>شناسه تلگرام:</b> <code>${esc(u)}</code>`);
    buttonRows.push([copyBtn("🪪 شناسه تلگرام", u)]);
  }

  const un = String(username || "").trim();
  if (un) {
    textLines.push(`🆔 <b>آیدی تلگرام:</b> <code>@${esc(un)}</code>`);
    buttonRows.push([copyBtn("🆔 آیدی تلگرام", `@${un}`)]);
  }

  return { textLines, buttonRows };
}

function buildContactBlock(textLines) {
  if (!textLines.length) return "";
  const SEP = "━".repeat(20);
  return (
    `${SEP}\n` +
    `ℹ️ <b>اطلاعات تماس کاربر</b>\n` +
    `${SEP}\n\n` +
    textLines.join("\n") +
    `\n\n${SEP}`
  );
}

/* ============================================================
 * Stats
 * ============================================================ */

async function showStats(env, chat, opts = {}) {
  const posRows = await all(
    env.DB,
    "SELECT status, COUNT(*) AS n FROM pos_requests GROUP BY status"
  );
  const repRows = await all(
    env.DB,
    "SELECT status, COUNT(*) AS n FROM repair_requests GROUP BY status"
  );

  const summarize = (rows) => {
    const o = { pending: 0, reviewed: 0, cancelled: 0, total: 0 };
    for (const r of rows) {
      const n = Number(r.n) || 0;
      if (o[r.status] !== undefined) {
        o[r.status] = n;
        o.total += n;
      }
    }
    return o;
  };

  const pos = summarize(posRows);
  const rep = summarize(repRows);

  const todayStart = tehranDayStartUtc(0);
  const weekStart = tehranDayStartUtc(6);

  const today = await one(env.DB, `
    SELECT
      (SELECT COUNT(*) FROM pos_requests    WHERE created_at >= ?) AS pos_today,
      (SELECT COUNT(*) FROM repair_requests WHERE created_at >= ?) AS rep_today,
      (SELECT COUNT(*) FROM pos_requests    WHERE created_at >= ?) AS pos_week,
      (SELECT COUNT(*) FROM repair_requests WHERE created_at >= ?) AS rep_week
  `, todayStart, todayStart, weekStart, weekStart);

  const posToday = Number(today?.pos_today || 0);
  const repToday = Number(today?.rep_today || 0);
  const posWeek  = Number(today?.pos_week  || 0);
  const repWeek  = Number(today?.rep_week  || 0);

  const SEP = "━━━━━━━━━━━━━━━━";

  const text =
    `📊 <b>آمار کلی درخواست‌ها</b>\n\n` +
    `🛒 <b>درخواست‌های کارتخوان</b>\n` +
    `   ⏳ در انتظار: <b>${faDigits(pos.pending)}</b>\n` +
    `   ✅ بررسی شده: <b>${faDigits(pos.reviewed)}</b>\n` +
    `   ❌ لغو شده: <b>${faDigits(pos.cancelled)}</b>\n` +
    `   📦 مجموع: <b>${faDigits(pos.total)}</b>\n\n` +
    `🛠️ <b>درخواست‌های تعمیرات</b>\n` +
    `   ⏳ در انتظار: <b>${faDigits(rep.pending)}</b>\n` +
    `   ✅ بررسی شده: <b>${faDigits(rep.reviewed)}</b>\n` +
    `   ❌ لغو شده: <b>${faDigits(rep.cancelled)}</b>\n` +
    `   📦 مجموع: <b>${faDigits(rep.total)}</b>\n\n` +
    `${SEP}\n` +
    `📅 <b>امروز:</b> ${faDigits(posToday + repToday)} درخواست\n` +
    `   🛒 ${faDigits(posToday)} | 🛠️ ${faDigits(repToday)}\n\n` +
    `📅 <b>۷ روز اخیر:</b> ${faDigits(posWeek + repWeek)} درخواست\n` +
    `   🛒 ${faDigits(posWeek)} | 🛠️ ${faDigits(repWeek)}`;

  return adminAnswer(env, chat, text, kb([adminHomeRow()]), opts, true);
}

/* ============================================================
 * Request listings — POS
 * ============================================================ */

async function showPosRequests(env, chat, page = 1, filter = {}, opts = {}) {
  const status = REQUEST_STATUSES.includes(filter?.status) ? filter.status : null;
  const query = filter?.query ? String(filter.query).trim() : null;

  const conditions = [];
  const args = [];

  if (status) {
    conditions.push("status = ?");
    args.push(status);
  }

  if (query) {
    const q = buildPosSearchConditions(query);
    conditions.push(...q.conditions);
    args.push(...q.args);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = await one(
    env.DB,
    `SELECT COUNT(*) AS n FROM pos_requests ${where}`,
    ...args
  );
  const total = Number(totalRow?.n || 0);

  if (total === 0 && !status && !query) {
    return adminAnswer(
      env, chat,
      "📭 <b>درخواستی ثبت نشده است</b>",
      utilAdminMenu(), opts, true
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = safePage(page, totalPages);

  let rows = [];
  if (total > 0) {
    const offset = (p - 1) * PAGE_SIZE;
    rows = await all(
      env.DB,
      `SELECT id,device_model,status FROM pos_requests ${where}
       ORDER BY id DESC LIMIT ? OFFSET ?`,
      ...args, PAGE_SIZE, offset
    );
  }

  let title = "🛒 <b>درخواست‌های کارتخوان</b>";
  if (query) title = `🔍 <b>جستجو:</b> «${esc(query)}»`;
  else if (status)
    title = `🛒 <b>درخواست‌های کارتخوان</b> — ${statusFa[status] || status}`;

  const subtitle = total > 0
    ? `📄 <b>صفحه ${faDigits(p)} از ${faDigits(totalPages)}</b>\n` +
      `📦 <b>مجموع: ${faDigits(total)}</b>`
    : `📭 <b>موردی یافت نشد</b>`;

  const kbRows = [];

  const filterType = query ? "q" : status ? "s" : "all";
  const filterValue = status || null;
  const fSuffix = filterSuffix(filterType, filterValue);

  kbRows.push(
    ...rows.map((x) => [
      btn(
        `#${faDigits(x.id)} ${x.device_model} ${statusFa[x.status] || x.status}`,
        `a:posreq:${x.id}:${p}${fSuffix}`
      ),
    ])
  );

  const prefix = query
    ? "a:pos:search"
    : status
      ? `a:pos:s:${status}`
      : "a:pos";

  kbRows.push(...paginate(prefix, p, totalPages));

  kbRows.push([
    btn("📋 همه", "a:pos"),
    btn("⏳ در انتظار", "a:pos:s:pending"),
    btn("✅ بررسی شده", "a:pos:s:reviewed"),
    btn("❌ لغو شده", "a:pos:s:cancelled"),
  ]);

  kbRows.push([
    btn(query ? "🔍 جستجوی جدید" : "🔍 جستجو", "a:pos:search"),
    btn("📥 دانلود CSV", "a:pos:csv"),
  ]);

  if (status || query) {
    kbRows.push([btn("⬅️ بازگشت به لیست کامل", "a:pos")]);
  }

  kbRows.push(adminHomeRow());

  return adminAnswer(env, chat, `${title}\n${subtitle}`, kb(kbRows), opts, true);
}

/* ============================================================
 * Request listings — Repair
 * ============================================================ */

async function showRepairRequests(env, chat, page = 1, filter = {}, opts = {}) {
  const status = REQUEST_STATUSES.includes(filter?.status) ? filter.status : null;
  const query = filter?.query ? String(filter.query).trim() : null;

  const conditions = [];
  const args = [];

  if (status) {
    conditions.push("r.status = ?");
    args.push(status);
  }

  if (query) {
    const q = buildRepairSearchConditions(query);
    conditions.push(...q.conditions);
    args.push(...q.args);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = await one(
    env.DB,
    `SELECT COUNT(*) AS n
     FROM repair_requests r
     JOIN devices d ON d.id=r.device_id
     ${where}`,
    ...args
  );
  const total = Number(totalRow?.n || 0);

  if (total === 0 && !status && !query) {
    return adminAnswer(
      env, chat,
      "📭 <b>درخواستی ثبت نشده است</b>",
      utilAdminMenu(), opts, true
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = safePage(page, totalPages);

  let rows = [];
  if (total > 0) {
    const offset = (p - 1) * PAGE_SIZE;
    rows = await all(
      env.DB,
      `SELECT r.id,d.model,r.problem_type,r.status
       FROM repair_requests r
       JOIN devices d ON d.id=r.device_id
       ${where}
       ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      ...args, PAGE_SIZE, offset
    );
  }

  let title = "🛠️ <b>درخواست‌های تعمیرات</b>";
  if (query) title = `🔍 <b>جستجو:</b> «${esc(query)}»`;
  else if (status)
    title = `🛠️ <b>درخواست‌های تعمیرات</b> — ${statusFa[status] || status}`;

  const subtitle = total > 0
    ? `📄 <b>صفحه ${faDigits(p)} از ${faDigits(totalPages)}</b>\n` +
      `📦 <b>مجموع: ${faDigits(total)}</b>`
    : `📭 <b>موردی یافت نشد</b>`;

  const kbRows = [];

  const filterType = query ? "q" : status ? "s" : "all";
  const filterValue = status || null;
  const fSuffix = filterSuffix(filterType, filterValue);

  kbRows.push(
    ...rows.map((x) => [
      btn(
        `#${faDigits(x.id)} ${x.model} ${statusFa[x.status] || x.status}`,
        `a:repairreq:${x.id}:${p}${fSuffix}`
      ),
    ])
  );

  const prefix = query
    ? "a:repair:search"
    : status
      ? `a:repair:s:${status}`
      : "a:repair";

  kbRows.push(...paginate(prefix, p, totalPages));

  kbRows.push([
    btn("📋 همه", "a:repair"),
    btn("⏳ در انتظار", "a:repair:s:pending"),
    btn("✅ بررسی شده", "a:repair:s:reviewed"),
    btn("❌ لغو شده", "a:repair:s:cancelled"),
  ]);

  kbRows.push([
    btn(query ? "🔍 جستجوی جدید" : "🔍 جستجو", "a:repair:search"),
    btn("📥 دانلود CSV", "a:repair:csv"),
  ]);

  if (status || query) {
    kbRows.push([btn("⬅️ بازگشت به لیست کامل", "a:repair")]);
  }

  kbRows.push(adminHomeRow());

  return adminAnswer(env, chat, `${title}\n${subtitle}`, kb(kbRows), opts, true);
}

/* ============================================================
 * CSV date-range menu
 * ============================================================ */

async function showCsvMenu(env, chat, kind, opts = {}) {
  const isPos = kind === "pos";
  const title = isPos
    ? "📥 <b>دانلود CSV — درخواست‌های کارتخوان</b>"
    : "📥 <b>دانلود CSV — درخواست‌های تعمیرات</b>";

  const backCb = isPos ? "a:pos" : "a:repair";

  return adminAnswer(
    env,
    chat,
    `${title}\n\n` +
      `📦 حداکثر ${faDigits(CSV_MAX_ROWS)} ردیف در هر خروجی\n` +
      `👇 بازه‌ی زمانی را انتخاب کنید:`,
    kb([
      [btn(CSV_DATE_RANGES.today.label, `a:${kind}:csv:today`)],
      [btn(CSV_DATE_RANGES["7d"].label, `a:${kind}:csv:7d`)],
      [btn(CSV_DATE_RANGES["30d"].label, `a:${kind}:csv:30d`)],
      [btn(CSV_DATE_RANGES.all.label, `a:${kind}:csv:all`)],
      adminNavRow(backCb),
    ]),
    opts
  );
}

/* ============================================================
 * Devices
 * ============================================================ */

async function showDevices(env, chat, page = 1, opts = {}) {
  const totalRow = await one(
    env.DB,
    "SELECT COUNT(*) AS n FROM devices WHERE is_deleted=0"
  );
  const total = Number(totalRow?.n || 0);

  if (!total) {
    return adminAnswer(
      env, chat,
      "📭 <b>دستگاهی ثبت نشده است</b>",
      kb([
        [btn("➕ افزودن دستگاه", "a:add")],
        adminNavRow("a:home"),
      ]),
      opts, true
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / DEVICES_PAGE_SIZE));
  const p = safePage(page, totalPages);
  const offset = (p - 1) * DEVICES_PAGE_SIZE;

  const rows = await all(
    env.DB,
    `SELECT id,model,is_available FROM devices
     WHERE is_deleted=0 ORDER BY id DESC LIMIT ? OFFSET ?`,
    DEVICES_PAGE_SIZE, offset
  );

  const subtitle = totalPages > 1
    ? `\n📄 <b>صفحه ${faDigits(p)} از ${faDigits(totalPages)}</b>\n` +
      `📦 <b>مجموع: ${faDigits(total)}</b>`
    : `\n📦 <b>مجموع: ${faDigits(total)}</b>`;

  const addCb = p > 1 ? `a:add:${p}` : "a:add";

  return adminAnswer(
    env, chat,
    `💳 <b>مدیریت دستگاه‌ها</b>${subtitle}`,
    kb([
      [btn("➕ افزودن دستگاه", addCb)],
      ...rows.map((d) => [
        btn(`${d.model} ${d.is_available ? "🟢" : "🔴"}`, `a:dev:${d.id}:${p}`),
      ]),
      ...paginate("a:devices", p, totalPages),
      adminHomeRow(),
    ]),
    opts, true
  );
}

async function showDevice(env, chat, id, fromPage = 1, opts = {}) {
  const d = await one(
    env.DB,
    "SELECT * FROM devices WHERE id=? AND is_deleted=0",
    id
  );
  if (!d)
    return adminAnswer(env, chat, "❓ <b>دستگاه پیدا نشد</b>", backHome(), opts);

  const guides = await all(
    env.DB,
    "SELECT problem_type FROM troubleshooting_guides WHERE device_id=? ORDER BY problem_type",
    id
  );

  const p = Number(fromPage) || 1;
  const backCb = p > 1 ? `a:devices:p:${p}` : "a:devices";

  const text =
    `💳 <b>${esc(d.model)}</b>\n` +
    `${d.is_available ? "🟢 <b>موجود</b>" : "🔴 <b>ناموجود</b>"}\n` +
    `📝 <b>توضیحات:</b> ${d.description ? "✅ ثبت‌شده" : "📄 ثبت‌نشده"}\n` +
    `🖼️ <b>تصویر:</b> ${d.device_image_file_id ? "✅ ثبت‌شده" : "📄 ثبت‌نشده"}\n` +
    `📚 <b>راهنماها:</b> ${
      guides.length
        ? `✅ ثبت‌شده — ${guides
            .map((g) => problemFa[g.problem_type] || g.problem_type)
            .join("، ")}`
        : "📄 ثبت‌نشده"
    }`;

  const keyboard = kb([
    [btn(d.is_available ? "🔴 ناموجود کردن" : "🟢 موجود کردن", `a:toggle:${d.id}:${p}`)],
    [btn("✏️ ویرایش توضیحات", `a:desc:${d.id}:${p}`)],
    [btn("🖼️ ویرایش تصویر", `a:image:${d.id}:${p}`)],
    [btn("🛠️ ویرایش راهنما", `a:guide:${d.id}:${p}`)],
    [btn("🗑️ حذف دستگاه", `a:delete:${d.id}:${p}`)],
    adminNavRow(backCb),
  ]);

  return adminAnswer(
    env, chat, text, keyboard,
    { ...opts, imageFileId: d.device_image_file_id || null },
    false
  );
}

async function showGuideMenu(env, chat, id, fromPage = 1, opts = {}) {
  const d = await one(
    env.DB,
    "SELECT model FROM devices WHERE id=? AND is_deleted=0",
    id
  );
  if (!d)
    return adminAnswer(env, chat, "❓ <b>دستگاه پیدا نشد</b>", backHome(), opts);

  const p = Number(fromPage) || 1;
  const backCb = p > 1 ? `a:dev:${id}:${p}` : `a:dev:${id}`;

  return adminAnswer(
    env, chat,
    `🛠️ <b>راهنمای ${esc(d.model)}</b>\n📌 <b>نوع مشکل را انتخاب کنید:</b>`,
    kb([
      ...PROBLEM_TYPES.map((pt) => [
        btn(`${problemFa[pt]}`, `a:guideproblem:${id}:${pt}:${p}`),
      ]),
      adminNavRow(backCb),
    ]),
    opts
  );
}/* ============================================================
 * Request detail screens
 * ============================================================ */

async function showPosDetail(
  env, chat, id, fromPage = 1,
  filterType = "all", filterValue = null, opts = {}
) {
  const r = await one(
    env.DB,
    `SELECT p.*,u.username
     FROM pos_requests p
     LEFT JOIN users u ON u.telegram_id=p.telegram_user_id
     WHERE p.id=?`,
    id
  );
  if (!r)
    return adminAnswer(env, chat, "❓ <b>درخواست پیدا نشد</b>", utilAdminMenu(), opts);

  const { textLines, buttonRows } = buildContactFields({
    phone: r.phone_number,
    username: r.username,
    uid: r.telegram_user_id,
  });
  const contactBlock = buildContactBlock(textLines);

  const applicantExtra =
    r.applicant_type === "legal"
      ? `🏢 <b>نام شرکت:</b> ${esc(r.company_name || "-")}\n`
      : `🌐 <b>تابعیت:</b> ${esc(r.nationality || "-")}\n`;

  const text =
    `🛒 <b>درخواست #${faDigits(r.id)}</b>\n` +
    `💳 <b>مدل دستگاه:</b> ${esc(r.device_model)}\n` +
    `👥 <b>نوع:</b> ${esc(r.applicant_type === "legal" ? "🏢 حقوقی" : "👤 حقیقی")}\n` +
    `✍️ <b>نام و نام خانوادگی:</b> ${esc(r.full_name || "-")}\n` +
    applicantExtra +
    `📝 <b>توضیحات:</b> ${esc(r.description || "-")}\n` +
    `📌 <b>وضعیت:</b> ${esc(statusFa[r.status] || r.status)}\n` +
    `📅 <b>تاریخ ثبت:</b> ${toJalali(r.created_at)}` +
    (r.updated_at && r.updated_at !== r.created_at
      ? `\n🔄 <b>آخرین تغییر:</b> ${toJalali(r.updated_at)}`
      : "") +
    (contactBlock ? `\n\n${contactBlock}` : "");

  const p = Number(fromPage) || 1;
  const back = backToList("pos", p, filterType, filterValue);
  const fSuffix = filterSuffix(filterType, filterValue);

  const rows = [
    [
      btn("✅ بررسی شده", `a:posstatus:${r.id}:reviewed:${p}${fSuffix}`),
      btn("❌ لغو بررسی", `a:posstatus:${r.id}:cancelled:${p}${fSuffix}`),
    ],
    [btn("⏳ در انتظار بررسی", `a:posstatus:${r.id}:pending:${p}${fSuffix}`)],
    [btn("📩 ارسال یادداشت به کاربر", `a:posnote:${r.id}:${p}${fSuffix}`)],
    ...buttonRows,
    adminNavRow(back),
  ];

  return adminAnswer(env, chat, text, kb(rows), opts);
}

async function showRepairDetail(
  env, chat, id, fromPage = 1,
  filterType = "all", filterValue = null, opts = {}
) {
  const r = await one(
    env.DB,
    `SELECT r.*,d.model,u.username
     FROM repair_requests r
     JOIN devices d ON d.id=r.device_id
     LEFT JOIN users u ON u.telegram_id=r.telegram_user_id
     WHERE r.id=?`,
    id
  );
  if (!r)
    return adminAnswer(env, chat, "❓ <b>درخواست پیدا نشد</b>", utilAdminMenu(), opts);

  const { textLines, buttonRows } = buildContactFields({
    phone: r.phone_number,
    username: r.username,
    uid: r.telegram_user_id,
  });
  const contactBlock = buildContactBlock(textLines);

  const text =
    `🛠️ <b>درخواست تعمیر #${faDigits(r.id)}</b>\n` +
    `💳 <b>مدل دستگاه:</b> ${esc(r.model)}\n` +
    `🛠️ <b>نوع مشکل:</b> ${esc(problemFa[r.problem_type] || r.problem_type)}\n` +
    `✍️ <b>نام و نام خانوادگی:</b> ${esc(r.full_name || "-")}\n` +
    `📝 <b>توضیحات:</b> ${esc(r.description || "-")}\n` +
    `📌 <b>وضعیت:</b> ${esc(statusFa[r.status] || r.status)}\n` +
    `📅 <b>تاریخ ثبت:</b> ${toJalali(r.created_at)}` +
    (r.updated_at && r.updated_at !== r.created_at
      ? `\n🔄 <b>آخرین تغییر:</b> ${toJalali(r.updated_at)}`
      : "") +
    (contactBlock ? `\n\n${contactBlock}` : "");

  const p = Number(fromPage) || 1;
  const back = backToList("repair", p, filterType, filterValue);
  const fSuffix = filterSuffix(filterType, filterValue);

  const rows = [
    [
      btn("✅ بررسی شده", `a:repstatus:${r.id}:reviewed:${p}${fSuffix}`),
      btn("❌ لغو بررسی", `a:repstatus:${r.id}:cancelled:${p}${fSuffix}`),
    ],
    [btn("⏳ در انتظار بررسی", `a:repstatus:${r.id}:pending:${p}${fSuffix}`)],
    [btn("📩 ارسال یادداشت به کاربر", `a:repnote:${r.id}:${p}${fSuffix}`)],
    ...buttonRows,
    adminNavRow(back),
  ];

  return adminAnswer(env, chat, text, kb(rows), opts);
}

/* ============================================================
 * Status update
 * ============================================================ */

async function updateRequestStatus(
  env, chat, kind, id, status, actor,
  fromPage = 1, filterType = "all", filterValue = null, opts = {}, ctx = null
) {
  const table = TABLES[kind];
  if (!table)
    return adminAnswer(env, chat, "⚠️ <b>نوع درخواست نامعتبر است</b>", utilAdminMenu(), opts);

  if (!REQUEST_STATUSES.includes(status)) {
    return adminAnswer(env, chat, "⚠️ <b>وضعیت نامعتبر است</b>", utilAdminMenu(), opts);
  }

  const row = await one(env.DB, `SELECT * FROM ${table} WHERE id=?`, id);
  if (!row)
    return adminAnswer(env, chat, "❓ <b>درخواست پیدا نشد</b>", utilAdminMenu(), opts);

  if (String(row.status) === String(status)) {
    return kind === "pos"
      ? showPosDetail(env, chat, id, fromPage, filterType, filterValue, opts)
      : showRepairDetail(env, chat, id, fromPage, filterType, filterValue, opts);
  }

  await run(
    env.DB,
    `UPDATE ${table} SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    status, id
  );

  fireAndForget(
    ctx,
    audit(env, actor, `request_status_${kind}`, `#${id}`, `${row.status} -> ${status}`)
  );

  const stEmoji = STATUS_EMOJI[status] || "";
  const stText = STATUS_FA_PLAIN[status] || status;

  fireAndForget(
    ctx,
    (async () => {
      try {
        await tg(env, "sendMessage", {
          chat_id: row.telegram_user_id,
          text:
            `🔔 <b>وضعیت درخواست شما به‌روزرسانی شد</b>\n\n` +
            `🆔 <b>شماره درخواست:</b> #${faDigits(id)}\n` +
            `📌 <b>وضعیت جدید:</b> ${stEmoji} <b>${esc(stText)}</b>`,
          parse_mode: "HTML",
          reply_markup: kb([[btn("❌ بستن", "u:close")]]),
        });
      } catch (e) {
        console.error("user status notify failed:", safeError(e));
      }
    })()
  );

  return kind === "pos"
    ? showPosDetail(env, chat, id, fromPage, filterType, filterValue, opts)
    : showRepairDetail(env, chat, id, fromPage, filterType, filterValue, opts);
}

/* ============================================================
 * Personalization
 * ============================================================ */

async function showSettings(env, chat, opts = {}) {
  return adminAnswer(
    env, chat,
    "🎨 <b>شخصی‌سازی</b>",
    kb([
      [btn("🖼️ ویرایش تصویر داشبورد مدیریت", "a:admin_welcome:menu")],
      [btn("👋 ویرایش خوش‌آمدگویی", "a:welcome:menu")],
      [btn("📞 ویرایش درباره‌ما - تماس‌باما", "a:about:menu")],
      [btn("👥 ویرایش اطلاعات پذیرنده", "a:applicant:menu")],
      [btn("🛡️ ویرایش گارانتی‌ها", "a:warranty:menu")],
      adminHomeRow(),
    ]),
    opts, true
  );
}

async function showAdminWelcomeMenu(env, chat, opts = {}) {
  const s = await one(
    env.DB,
    "SELECT admin_welcome_image_file_id FROM settings WHERE id=1"
  );
  const hasImage = Boolean(s?.admin_welcome_image_file_id);

  return adminAnswer(
    env, chat,
    "🖼️ <b>ویرایش تصویر داشبورد مدیریت</b>\n\n" +
      `📌 <b>وضعیت:</b> ${hasImage ? "✅ ثبت‌شده" : "📄 ثبت‌نشده"}\n\n` +
      `<b>این تصویر برای داشبورد مدیریت نمایش داده می‌شود</b>`,
    kb([
      [btn("🖼️ ویرایش تصویر", "a:set:admin_welcome_image")],
      adminNavRow("a:personal"),
    ]),
    opts
  );
}

async function showWelcomeMenu(env, chat, opts = {}) {
  const s = await one(
    env.DB,
    "SELECT welcome_message, welcome_image_file_id FROM settings WHERE id=1"
  );
  const msgLen = String(s?.welcome_message || "").length;
  const hasImage = Boolean(s?.welcome_image_file_id);

  return adminAnswer(
    env, chat,
    "👋 <b>ویرایش خوش‌آمدگویی</b>\n\n" +
      `✍️ <b>پیام:</b> ${msgLen ? `${faDigits(msgLen)} کاراکتر ثبت‌شده` : "📄 ثبت‌نشده"}\n` +
      `🖼️ <b>تصویر:</b> ${hasImage ? "✅ ثبت‌شده" : "📄 ثبت‌نشده"}`,
    kb([
      [btn("✍️ ویرایش پیام", "a:set:welcome")],
      [btn("🖼️ ویرایش تصویر", "a:set:welcome_image")],
      adminNavRow("a:personal"),
    ]),
    opts
  );
}

async function showAboutMenu(env, chat, opts = {}) {
  const s = await one(
    env.DB,
    "SELECT about_contact_description, about_contact_image_file_id FROM settings WHERE id=1"
  );
  const msgLen = String(s?.about_contact_description || "").length;
  const hasImage = Boolean(s?.about_contact_image_file_id);

  return adminAnswer(
    env, chat,
    "📞 <b>ویرایش درباره‌ما - تماس‌باما</b>\n\n" +
      `✍️ <b>متن:</b> ${msgLen ? `${faDigits(msgLen)} کاراکتر ثبت‌شده` : "📄 ثبت‌نشده"}\n` +
      `🖼️ <b>تصویر:</b> ${hasImage ? "✅ ثبت‌شده" : "📄 ثبت‌نشده"}`,
    kb([
      [btn("✍️ ویرایش متن", "a:set:about")],
      [btn("🖼️ ویرایش تصویر", "a:set:about_image")],
      adminNavRow("a:personal"),
    ]),
    opts
  );
}

async function showWarrantyMenu(env, chat, opts = {}) {
  const s = await one(
    env.DB,
    "SELECT new_warranty, used_warranty FROM settings WHERE id=1"
  );
  const newLen = String(s?.new_warranty || "").length;
  const usedLen = String(s?.used_warranty || "").length;

  return adminAnswer(
    env, chat,
    "🛡️ <b>ویرایش گارانتی‌ها</b>\n\n" +
      `📦 <b>آکبند:</b> ${newLen ? `${faDigits(newLen)} کاراکتر ثبت‌شده` : "📄 ثبت‌نشده"}\n` +
      `♻️ <b>استوک:</b> ${usedLen ? `${faDigits(usedLen)} کاراکتر ثبت‌شده` : "📄 ثبت‌نشده"}`,
    kb([
      [btn("📦 گارانتی آکبند", "a:set:new_warranty")],
      [btn("♻️ گارانتی استوک", "a:set:used_warranty")],
      adminNavRow("a:personal"),
    ]),
    opts
  );
}

async function showApplicantMenu(env, chat, opts = {}) {
  const s = await one(env.DB, "SELECT intro_legal FROM settings WHERE id=1");
  const legalLen = String(s?.intro_legal || "").length;

  return adminAnswer(
    env, chat,
    "👥 <b>ویرایش اطلاعات پذیرنده</b>\n\n" +
      `👤 <b>پذیرنده حقیقی:</b> مشمول تابعیت\n` +
      `🏢 <b>پذیرنده حقوقی:</b> ${legalLen ? `${faDigits(legalLen)} کاراکتر ثبت‌شده` : "📄 ثبت‌نشده"}`,
    kb([
      [btn("👤 پذیرنده حقیقی", "a:applicant_individual")],
      [btn("🏢 پذیرنده حقوقی", "a:applicant_legal")],
      adminNavRow("a:personal"),
    ]),
    opts
  );
}

async function showIndividualMenu(env, chat, opts = {}) {
  const s = await one(
    env.DB,
    "SELECT note_iranian, note_foreign FROM settings WHERE id=1"
  );
  const iranianLen = String(s?.note_iranian || "").length;
  const foreignLen = String(s?.note_foreign || "").length;

  return adminAnswer(
    env, chat,
    "👤 <b>پذیرنده حقیقی</b>\n\n" +
      `🇮🇷 <b>ایرانی:</b> ${iranianLen ? `${faDigits(iranianLen)} کاراکتر ثبت‌شده` : "📄 ثبت‌نشده"}\n` +
      `🌍 <b>اتباع خارجی:</b> ${foreignLen ? `${faDigits(foreignLen)} کاراکتر ثبت‌شده` : "📄 ثبت‌نشده"}`,
    kb([
      [btn("🇮🇷 ایرانی", "a:set:note_iranian")],
      [btn("🌍 اتباع خارجی", "a:set:note_foreign")],
      adminNavRow("a:applicant:menu"),
    ]),
    opts
  );
}

/* ============================================================
 * Security
 * ============================================================ */

async function showSecurity(env, chat, opts = {}) {
  return adminAnswer(
    env, chat,
    "⚙️ <b>تنظیمات امنیتی</b>",
    kb([
      [btn("👥 مدیریت ادمین‌ها", "a:admins")],
      [btn("🔐 آخرین ورودها", "a:logins")],
      [btn("📋 گزارش تغییرات", "a:audit")],
      adminHomeRow(),
    ]),
    opts, true
  );
}

async function showAdmins(env, chat, role, opts = {}) {
  const rows = await all(
    env.DB,
    "SELECT id,name,telegram_id,is_active,role FROM admins ORDER BY id DESC"
  );

  const superAdmin = isSuperAdmin(env, role.telegram_id);
  const superId = String(env.SUPER_ADMIN_ID || "");

  const lines = [];
  if (superId) {
    if (superAdmin) {
      lines.push(`👑 🟢 Super Admin | <code>${esc(superId)}</code> | superadmin`);
    } else {
      lines.push(`👑 🟢 Super Admin | superadmin`);
    }
  }
  for (const x of rows) {
    if (String(x.telegram_id) === superId) continue;
    lines.push(
      superAdmin
        ? `🔑 ${x.is_active ? "🟢" : "🔴"} ${esc(x.name)} | <code>${esc(x.telegram_id)}</code> | ${esc(x.role)}`
        : `🔑 ${x.is_active ? "🟢" : "🔴"} ${esc(x.name)} | ${esc(x.role)}`
    );
  }
  const listText = lines.length ? lines.join("\n") : "📭 <b>ادمینی ثبت نشده است</b>";

  const buttons = [];
  if (superAdmin && superId) {
    buttons.push([btn("👑 🟢 Super Admin", "a:admin:superinfo")]);
  }

  if (superAdmin) {
    for (const x of rows) {
      if (String(x.telegram_id) === superId) continue;
      buttons.push([
        btn(
          `🔑 ${x.is_active ? "🟢" : "🔴"} ${x.name}`,
          `a:admin:view:${x.id}`
        ),
      ]);
    }
  }

  const extra = superAdmin ? [[btn("➕ افزودن ادمین", "a:admin:add")]] : [];

  return adminAnswer(
    env, chat,
    "👥 <b>مدیریت ادمین‌ها</b>\n\n" + listText,
    kb([...extra, ...buttons, adminNavRow("a:security")]),
    opts
  );
}

async function showAdminDetail(env, chat, id, role, opts = {}) {
  if (!isSuperAdmin(env, role.telegram_id)) {
    return adminAnswer(env, chat, "⛔ <b>فقط Super Admin مجاز است</b>", utilAdminMenu(), opts);
  }

  const a = await one(
    env.DB,
    "SELECT id,name,telegram_id,is_active,role,created_at FROM admins WHERE id=?",
    id
  );
  if (!a) return adminAnswer(env, chat, "❓ <b>ادمین پیدا نشد</b>", backHome(), opts);

  const isSelf = String(a.telegram_id) === String(env.SUPER_ADMIN_ID || "");
  const icon = isSelf ? "👑" : "🔑";

  const statusLine = a.is_active
    ? `🟢 <b>فعال</b>`
    : `🔴 <b>غیرفعال</b>`;

  const text =
    `${icon} <b>${esc(a.name)}</b>\n` +
    `🆔 <b>Telegram ID:</b> <code>${esc(a.telegram_id)}</code>\n` +
    `🎭 <b>نقش:</b> ${esc(a.role)}\n` +
    `📌 <b>وضعیت:</b> ${statusLine}\n` +
    `📅 <b>تاریخ:</b> ${toJalali(a.created_at)}` +
    (isSelf ? "\n\n👑 <b>این حساب Super Admin است</b>" : "");

  const buttons = [];
  if (!isSelf) {
    buttons.push([
      btn(a.is_active ? "🔴 غیرفعال کردن" : "🟢 فعال کردن", `a:admin:toggle:${a.id}`),
    ]);
    buttons.push([btn("🗑️ حذف ادمین", `a:admin:delete:${a.id}`)]);
  }
  buttons.push(adminNavRow("a:admins"));

  return adminAnswer(env, chat, text, kb(buttons), opts);
}

async function showLogins(env, chat, page = 1, opts = {}, viewerRole = null) {
  const totalRow = await one(env.DB, "SELECT COUNT(*) AS n FROM login_logs");
  const total = Number(totalRow?.n || 0);

  if (!total) {
    return adminAnswer(
      env, chat,
      "📭 <b>ورودی ثبت نشده است</b>",
      kb([adminNavRow("a:security")]),
      opts
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / LOGINS_PAGE_SIZE));
  const p = safePage(page, totalPages);
  const offset = (p - 1) * LOGINS_PAGE_SIZE;

  const rows = await all(
    env.DB,
    "SELECT * FROM login_logs ORDER BY id DESC LIMIT ? OFFSET ?",
    LOGINS_PAGE_SIZE, offset
  );

  const startNum = (p - 1) * LOGINS_PAGE_SIZE;
  const superId = String(env.SUPER_ADMIN_ID || "");
  const viewerIsSuper = viewerRole && isSuperAdmin(env, viewerRole.telegram_id);

  const lines = rows.map((x, i) => {
    const num = startNum + i + 1;
    const name = x.admin_name ? esc(x.admin_name) : "—";
    const role = x.role ? esc(x.role) : "—";
    const ago = timeAgo(x.created_at);
    const when = ago ? `${ago} · ${toJalali(x.created_at)}` : toJalali(x.created_at);

    const isSuperRow = String(x.admin_telegram_id) === superId;
    const idText = (isSuperRow && !viewerIsSuper)
      ? "🔒 مخفی"
      : `<code>${esc(x.admin_telegram_id)}</code>`;

    return (
      `<b>${faDigits(num)}.</b> 👤 ${name} | 🎭 ${role}\n` +
      `🆔 ${idText} | 🕒 <code>${when}</code>`
    );
  });

  const subtitle = totalPages > 1
    ? `📄 <b>صفحه ${faDigits(p)} از ${faDigits(totalPages)}</b>\n` +
      `📦 <b>مجموع: ${faDigits(total)}</b>`
    : `📦 <b>مجموع: ${faDigits(total)}</b>`;

  const SEP = "━━━━━━━━━━━━━━━━";

  const text =
    `🔐 <b>آخرین ورودها</b>\n${subtitle}\n\n` +
    lines.join("\n\n") +
    `\n\n${SEP}`;

  return adminAnswer(
    env, chat,
    text,
    kb([
      ...paginate("a:logins", p, totalPages),
      adminNavRow("a:security"),
    ]),
    opts
  );
}

/* ============================================================
 * Audit logs
 * ============================================================ */

const AUDIT_ACTION_FA = {
  toggle_device_availability: "تغییر موجودی دستگاه",
  delete_device: "حذف دستگاه",
  create_device: "افزودن دستگاه",
  edit_device_description: "ویرایش توضیحات دستگاه",
  set_troubleshooting_guide: "ثبت راهنمای عیب‌یابی",
  set_welcome_message: "ویرایش پیام خوش‌آمد",
  set_about_contact_description: "ویرایش متن درباره‌ما",
  set_new_warranty: "ویرایش گارانتی آکبند",
  set_used_warranty: "ویرایش گارانتی استوک",
  set_intro_legal: "ویرایش متن پذیرنده حقوقی",
  set_note_iranian: "ویرایش متن «ایرانی»",
  set_note_foreign: "ویرایش متن «اتباع خارجی»",
  add_admin: "افزودن ادمین",
  toggle_admin: "تغییر وضعیت ادمین",
  delete_admin: "حذف ادمین",
  set_device_image: "ویرایش تصویر دستگاه",
  set_setting_image: "ویرایش تصویر تنظیمات",
  download_csv_pos: "دانلود CSV کارتخوان",
  download_csv_repair: "دانلود CSV تعمیرات",
};

function auditActionFa(action) {
  const a = String(action || "");
  if (AUDIT_ACTION_FA[a]) return AUDIT_ACTION_FA[a];
  if (a === "request_status_pos") return "تغییر وضعیت درخواست کارتخوان";
  if (a === "request_status_repair") return "تغییر وضعیت درخواست تعمیرات";
  if (a === "send_note_pos") return "ارسال یادداشت (کارتخوان)";
  if (a === "send_note_repair") return "ارسال یادداشت (تعمیرات)";
  return a;
}

function formatAuditRow(r, viewerIsSuper, superId) {
  const name = r.admin_name ? esc(r.admin_name) : "—";
  const action = esc(auditActionFa(r.action));

  const isSuperRow = String(r.admin_telegram_id) === superId;
  const idText = (isSuperRow && !viewerIsSuper)
    ? "🔒 مخفی"
    : `<code>${esc(r.admin_telegram_id)}</code>`;

  const target = r.target
    ? `\n🎯 <code>${esc(String(r.target).slice(0, 60))}</code>`
    : "";

  let detailsText = "";
  if (r.details) {
    const d = String(r.details);
    const truncated = d.length > 120 ? d.slice(0, 120) + "…" : d;
    detailsText = `\n📝 <i>${esc(truncated)}</i>`;
  }

  return (
    `🕒 <code>${toJalali(r.created_at)}</code>\n` +
    `👤 ${name} | ${idText}\n` +
    `⚡ <b>${action}</b>${target}${detailsText}`
  );
}

async function showAuditLogs(
  env, chat, page = 1, filterTelegramId = null, opts = {}, viewerRole = null
) {
  const hasFilter = Boolean(filterTelegramId && filterTelegramId !== "all");

  let where = "";
  let args = [];

  if (hasFilter) {
    const exists = await one(
      env.DB,
      "SELECT 1 FROM audit_logs WHERE admin_telegram_id = ? LIMIT 1",
      String(filterTelegramId)
    );

    if (!exists) {
      return adminAnswer(
        env, chat,
        "❓ <b>این ادمین هیچ لاگی ندارد</b>",
        kb([adminNavRow("a:security")]),
        opts
      );
    }

    where = "WHERE admin_telegram_id = ?";
    args = [String(filterTelegramId)];
  }

  const totalRow = await one(
    env.DB,
    `SELECT COUNT(*) AS n FROM audit_logs ${where}`,
    ...args
  );
  const total = Number(totalRow?.n || 0);

  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE) || 1);
  const p = safePage(page, totalPages);

  let rows = [];
  if (total > 0) {
    const offset = (p - 1) * AUDIT_PAGE_SIZE;
    rows = await all(
      env.DB,
      `SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      ...args, AUDIT_PAGE_SIZE, offset
    );
  }

  const superId = String(env.SUPER_ADMIN_ID || "");
  const viewerIsSuper = viewerRole && isSuperAdmin(env, viewerRole.telegram_id);

  const filterLabel = hasFilter
    ? `\n🔍 <b>فیلتر:</b> <code>${esc(filterTelegramId)}</code>`
    : "";

  const text = rows.length
    ? `📋 <b>گزارش تغییرات</b>\n` +
      `📄 <b>صفحه ${faDigits(p)} از ${faDigits(totalPages)}</b>\n` +
      `📦 <b>مجموع: ${faDigits(total)}</b>${filterLabel}\n\n` +
      rows.map((r) => formatAuditRow(r, viewerIsSuper, superId)).join("\n\n")
    : `📭 <b>گزارشی یافت نشد</b>${filterLabel}`;

  const prefix = hasFilter ? `a:audit:f:${filterTelegramId}` : "a:audit";

  const kbRows = [];
  kbRows.push(...paginate(prefix, p, totalPages));

  if (hasFilter) {
    kbRows.push([
      btn("❌ حذف فیلتر", "a:audit"),
      btn("🔍 فیلتر ادمین", "a:audit:filter"),
    ]);
  } else {
    kbRows.push([btn("🔍 فیلتر ادمین", "a:audit:filter")]);
  }
  kbRows.push(adminNavRow("a:security"));

  return adminAnswer(env, chat, text, kb(kbRows), opts);
}

async function showAuditFilter(env, chat, opts = {}) {
  const rows = await all(
    env.DB,
    `SELECT a.admin_telegram_id,
            (SELECT admin_name FROM audit_logs
              WHERE admin_telegram_id = a.admin_telegram_id
              ORDER BY id DESC LIMIT 1) AS admin_name,
            COUNT(*) AS n
     FROM audit_logs a
     GROUP BY a.admin_telegram_id
     ORDER BY n DESC
     LIMIT 20`
  );

  if (!rows.length) {
    return adminAnswer(
      env, chat,
      "📭 <b>هیچ ادمینی گزارش ثبت نکرده است</b>",
      kb([adminNavRow("a:audit")]),
      opts
    );
  }

  /* Defense-in-depth: drop any telegram_id that isn't purely
   * numeric before building callback data. */
  const safeRows = rows
    .map((r) => {
      const safeId = String(r.admin_telegram_id || "").replace(/[^\d]/g, "");
      if (!safeId) return null;
      return { ...r, safeId };
    })
    .filter(Boolean);

  if (!safeRows.length) {
    return adminAnswer(
      env, chat,
      "📭 <b>هیچ ادمینی گزارش ثبت نکرده است</b>",
      kb([adminNavRow("a:audit")]),
      opts
    );
  }

  return adminAnswer(
    env, chat,
    "🔍 <b>فیلتر گزارش تغییرات بر اساس ادمین</b>\n\n👇 <b>یک ادمین را انتخاب کنید:</b>",
    kb([
      [btn("📋 نمایش همه", "a:audit")],
      ...safeRows.map((r) => [
        btn(
          `${r.admin_name || "—"} (${faDigits(r.n)})`,
          `a:audit:f:${r.safeId}`
        ),
      ]),
      adminNavRow("a:audit"),
    ]),
    opts
  );
}

/* ============================================================
 * askText — prompt + session setup
 * ============================================================ */

async function askText(
  env, chat, userId, mode, step, data, prompt,
  backTo = "a:home", opts = {}
) {
  const nav = backTo && backTo !== "a:home" ? adminNavRow("a:back") : adminHomeRow();
  const result = await adminAnswer(env, chat, prompt, kb([nav]), opts);
  await sessionSet(env.DB, String(userId), mode, step, {
    ...data,
    __back_to: backTo,
    __prompt_msg_id: result?.message_id || opts?.editMessageId || null,
  });
  return result;
}

/* ============================================================
 * Callback dispatcher
 * ============================================================ */

export async function adminCallback(
  env, chat, data, role,
  editMessageId = null, ctx = null, wasPhoto = false
) {
  const adminId = String(role.telegram_id || chat);
  const opts = editMessageId ? { editMessageId, wasPhoto } : {};

  if (data === "n:noop") return;

  /* Session hygiene: keep the session only for actions that are
   * part of an ongoing multi-step flow (or explicit back/cancel). */
  const ADMIN_KEEP_SESSION = new Set([
    "a:back",
    "a:cancel",
    "a:add:skip",
  ]);

  function adminKeepsSession(d) {
    if (ADMIN_KEEP_SESSION.has(d)) return true;
    if (d.startsWith("a:pos:search:p:")) return true;
    if (d.startsWith("a:repair:search:p:")) return true;
    return false;
  }

  if (data.startsWith("a:") && !adminKeepsSession(data)) {
    await sessionClear(env.DB, adminId);
  }

  if (data === "a:home") return adminStart(env, chat, role, opts);

  if (data === "a:cancel") {
    await sessionClear(env.DB, adminId);
    return adminStart(env, chat, role, opts);
  }

  if (data === "a:back") {
    const s = await sessionGet(env.DB, adminId);
    const target = s?.data?.__back_to || "a:home";
    await sessionClear(env.DB, adminId);
    return adminCallback(env, chat, target, role, editMessageId, ctx, wasPhoto);
  }

  if (data === "a:rolechooser") {
    if (!isSuperAdmin(env, role.telegram_id)) {
      return adminAnswer(env, chat, "⛔ <b>دسترسی ندارید</b>", utilAdminMenu(false), opts);
    }
    return adminAnswer(
      env,
      chat,
      "👋 <b>درود</b>\n✨ <b>خوش آمدید</b>\n\n🔀 <b>لطفاً نوع ورود خود را انتخاب کنید:</b>",
      roleChooser(),
      opts
    );
  }

  if (data === "a:admin:superinfo") {
    if (!isSuperAdmin(env, role.telegram_id)) {
      return adminAnswer(env, chat, "⛔ <b>دسترسی ندارید</b>", utilAdminMenu(), opts);
    }
    return adminAnswer(
      env,
      chat,
      `👑 <b>Super Admin</b>\n` +
        `🆔 <b>Telegram ID:</b> <code>${esc(env.SUPER_ADMIN_ID || "-")}</code>\n` +
        `🎭 <b>نقش:</b> superadmin\n` +
        `📌 <b>وضعیت:</b> 🟢 <b>فعال</b>\n\n` +
        `👑 <b>این حساب بصورت پیش‌فرض تعریف شده است</b>`,
      kb([adminNavRow("a:admins")]),
      opts
    );
  }

  if (
    data.startsWith("a:poschat:") ||
    data.startsWith("a:repchat:") ||
    data.startsWith("a:poscall:") ||
    data.startsWith("a:repcall:")
  ) {
    const isPos = data.startsWith("a:pos");
    const parts = data.split(":");
    const id = parts[2];
    const page = parts[3] ? Number(parts[3]) : 1;
    if (/^\d+$/.test(id)) {
      return isPos
        ? showPosDetail(env, chat, id, page, "all", null, opts)
        : showRepairDetail(env, chat, id, page, "all", null, opts);
    }
    return adminAnswer(
      env, chat, "⚠️ <b>شناسه درخواست نامعتبر است</b>", utilAdminMenu(), opts
    );
  }

  if (data === "a:stats") return showStats(env, chat, opts);

  /* ---- POS listings ---- */
  if (data === "a:pos") {
    return showPosRequests(env, chat, 1, {}, opts);
  }
  if (data.startsWith("a:pos:p:")) {
    return showPosRequests(env, chat, parsePage(data.slice("a:pos:p:".length)), {}, opts);
  }
  if (data === "a:pos:search") {
    return askText(
      env, chat, adminId,
      "admin_search", "query", { kind: "pos" },
      "🔍 <b>عبارت جستجو را وارد کنید:</b>\n" +
        "<i>نام و نام خانوادگی، نام شرکت، شماره تلفن یا مدل دستگاه</i>",
      "a:pos", opts
    );
  }
  if (data.startsWith("a:pos:search:p:")) {
    const page = parsePage(data.slice("a:pos:search:p:".length));
    const s = await sessionGet(env.DB, adminId);
    if (
      !s || s.mode !== "admin_search" ||
      s.data?.kind !== "pos" || !s.data?.query
    ) {
      return showPosRequests(env, chat, 1, {}, opts);
    }
    return showPosRequests(env, chat, page, { query: s.data.query }, opts);
  }
  if (data.startsWith("a:pos:s:")) {
    const rest = data.slice("a:pos:s:".length);
    const m = rest.match(/^(pending|reviewed|cancelled)(?::p:(\d+))?$/);
    if (!m) return showPosRequests(env, chat, 1, {}, opts);
    const page = m[2] ? Number(m[2]) : 1;
    return showPosRequests(env, chat, page, { status: m[1] }, opts);
  }

  /* ---- POS CSV ---- */
  if (data === "a:pos:csv") {
    return showCsvMenu(env, chat, "pos", opts);
  }

  if (data.startsWith("a:pos:csv:")) {
    const range = data.slice("a:pos:csv:".length);
    if (!CSV_DATE_RANGES[range]) {
      return showCsvMenu(env, chat, "pos", opts);
    }

    const toastId = await toast(env, chat, "⏳ <b>در حال ساخت فایل...</b>");

    let result;
    try {
      result = await buildPosCsv(env, range);
    } catch (e) {
      console.error("buildPosCsv failed:", safeError(e));
      await deleteMsg(env, chat, toastId);
      return adminAnswer(
        env, chat,
        "⚠️ <b>خطا در ساخت فایل CSV</b>",
        utilAdminMenu(), opts
      );
    }

    if (!result.count) {
      await deleteMsg(env, chat, toastId);
      return adminAnswer(
        env, chat,
        "📭 <b>در این بازه داده‌ای وجود ندارد</b>",
        kb([adminNavRow("a:pos")]),
        opts
      );
    }

    const date = new Date().toISOString().slice(0, 10);
    const filename = `pos_${range}_${date}.csv`;

    let caption =
      `📊 <b>گزارش درخواست‌های کارتخوان</b>\n` +
      `📅 بازه: ${CSV_DATE_RANGES[range].label.replace("📅 ", "")}\n` +
      `📦 ${faDigits(result.count)} ردیف`;

    if (result.hitLimit) {
      caption +=
        `\n\n⚠️ <b>به سقف ${faDigits(CSV_MAX_ROWS)} ردیف رسیده‌اید</b>\n` +
        `<b>بازه‌ی کوچک‌تری انتخاب کنید</b>`;
    }

    try {
      await sendDocumentFromString(env, chat, filename, result.csv, caption);
    } catch (e) {
      console.error("sendDocumentFromString (pos) failed:", safeError(e));
      await deleteMsg(env, chat, toastId);
      return adminAnswer(
        env, chat,
        "⚠️ <b>ارسال فایل ناموفق بود</b>\nلطفا دوباره تلاش کنید",
        utilAdminMenu(), opts
      );
    }

    await deleteMsg(env, chat, toastId);

    fireAndForget(
      ctx,
      audit(env, role, "download_csv_pos", `range=${range} count=${result.count}`)
    );

    return;
  }

  /* ---- Repair listings ---- */
  if (data === "a:repair") {
    return showRepairRequests(env, chat, 1, {}, opts);
  }
  if (data.startsWith("a:repair:p:")) {
    return showRepairRequests(env, chat, parsePage(data.slice("a:repair:p:".length)), {}, opts);
  }
  if (data === "a:repair:search") {
    return askText(
      env, chat, adminId,
      "admin_search", "query", { kind: "repair" },
      "🔍 <b>عبارت جستجو را وارد کنید:</b>\n" +
        "<i>نام و نام خانوادگی، شماره تلفن یا مدل دستگاه</i>",
      "a:repair", opts
    );
  }
  if (data.startsWith("a:repair:search:p:")) {
    const page = parsePage(data.slice("a:repair:search:p:".length));
    const s = await sessionGet(env.DB, adminId);
    if (
      !s || s.mode !== "admin_search" ||
      s.data?.kind !== "repair" || !s.data?.query
    ) {
      return showRepairRequests(env, chat, 1, {}, opts);
    }
    return showRepairRequests(env, chat, page, { query: s.data.query }, opts);
  }
  if (data.startsWith("a:repair:s:")) {
    const rest = data.slice("a:repair:s:".length);
    const m = rest.match(/^(pending|reviewed|cancelled)(?::p:(\d+))?$/);
    if (!m) return showRepairRequests(env, chat, 1, {}, opts);
    const page = m[2] ? Number(m[2]) : 1;
    return showRepairRequests(env, chat, page, { status: m[1] }, opts);
  }

  /* ---- Repair CSV ---- */
  if (data === "a:repair:csv") {
    return showCsvMenu(env, chat, "repair", opts);
  }

  if (data.startsWith("a:repair:csv:")) {
    const range = data.slice("a:repair:csv:".length);
    if (!CSV_DATE_RANGES[range]) {
      return showCsvMenu(env, chat, "repair", opts);
    }

    const toastId = await toast(env, chat, "⏳ <b>در حال ساخت فایل...</b>");

    let result;
    try {
      result = await buildRepairCsv(env, range);
    } catch (e) {
      console.error("buildRepairCsv failed:", safeError(e));
      await deleteMsg(env, chat, toastId);
      return adminAnswer(
        env, chat,
        "⚠️ <b>خطا در ساخت فایل CSV</b>",
        utilAdminMenu(), opts
      );
    }

    if (!result.count) {
      await deleteMsg(env, chat, toastId);
      return adminAnswer(
        env, chat,
        "📭 <b>در این بازه داده‌ای وجود ندارد</b>",
        kb([adminNavRow("a:repair")]),
        opts
      );
    }

    const date = new Date().toISOString().slice(0, 10);
    const filename = `repair_${range}_${date}.csv`;

    let caption =
      `📊 <b>گزارش درخواست‌های تعمیرات</b>\n` +
      `📅 بازه: ${CSV_DATE_RANGES[range].label.replace("📅 ", "")}\n` +
      `📦 ${faDigits(result.count)} ردیف`;

    if (result.hitLimit) {
      caption +=
        `\n\n⚠️ <b>به سقف ${faDigits(CSV_MAX_ROWS)} ردیف رسیده‌اید</b>\n` +
        `<b>بازه‌ی کوچک‌تری انتخاب کنید</b>`;
    }

    try {
      await sendDocumentFromString(env, chat, filename, result.csv, caption);
    } catch (e) {
      console.error("sendDocumentFromString (repair) failed:", safeError(e));
      await deleteMsg(env, chat, toastId);
      return adminAnswer(
        env, chat,
        "⚠️ <b>ارسال فایل ناموفق بود</b>\nلطفا دوباره تلاش کنید",
        utilAdminMenu(), opts
      );
    }

    await deleteMsg(env, chat, toastId);

    fireAndForget(
      ctx,
      audit(env, role, "download_csv_repair", `range=${range} count=${result.count}`)
    );

    return;
  }

  if (data === "a:devices") return showDevices(env, chat, 1, opts);
  if (data.startsWith("a:devices:p:")) {
    return showDevices(env, chat, parsePage(data.slice("a:devices:p:".length)), opts);
  }

  if (data === "a:personal") return showSettings(env, chat, opts);
  if (data === "a:security") return showSecurity(env, chat, opts);
  if (data === "a:admins") return showAdmins(env, chat, role, opts);

  if (data === "a:logins") return showLogins(env, chat, 1, opts, role);
  if (data.startsWith("a:logins:p:")) {
    return showLogins(env, chat, parsePage(data.slice("a:logins:p:".length)), opts, role);
  }

  if (data === "a:audit") return showAuditLogs(env, chat, 1, null, opts, role);
  if (data === "a:audit:filter") return showAuditFilter(env, chat, opts);

  if (data.startsWith("a:audit:f:")) {
    const rest = data.slice("a:audit:f:".length);
    const parts = rest.split(":");
    const tgId = parts[0];
    const page = parts[1] === "p" && parts[2] ? Number(parts[2]) : 1;
    if (!/^\d{1,20}$/.test(tgId)) {
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه ادمین نامعتبر است</b>",
        utilAdminMenu(), opts
      );
    }
    return showAuditLogs(env, chat, page, tgId, opts, role);
  }

  if (data.startsWith("a:audit:p:")) {
    const page = parsePage(data.slice("a:audit:p:".length));
    return showAuditLogs(env, chat, page, null, opts, role);
  }

  if (data === "a:admin_welcome:menu") return showAdminWelcomeMenu(env, chat, opts);
  if (data === "a:welcome:menu") return showWelcomeMenu(env, chat, opts);
  if (data === "a:about:menu") return showAboutMenu(env, chat, opts);
  if (data === "a:warranty:menu") return showWarrantyMenu(env, chat, opts);
  if (data === "a:applicant:menu") return showApplicantMenu(env, chat, opts);
  if (data === "a:applicant_individual") return showIndividualMenu(env, chat, opts);

  if (data === "a:noop") {
    return adminAnswer(
      env, chat,
      "ℹ️ <b>این گزینه در دسترس نیست</b>",
      utilAdminMenu(), opts
    );
  }

  /* ---- Add device ---- */
  if (data === "a:add" || data.startsWith("a:add:p:")) {
    const fromPage = data.startsWith("a:add:p:")
      ? parsePage(data.slice("a:add:p:".length))
      : 1;
    const backTo = fromPage > 1 ? `a:devices:p:${fromPage}` : "a:devices";
    return askText(
      env, chat, adminId,
      "device_add", "model", { from_page: fromPage },
      "🏷️ <b>مدل دستگاه را وارد کنید:</b>",
      backTo, opts
    );
  }

  if (data === "a:add:skip") {
    const s = await sessionGet(env.DB, adminId);
    if (!s || s.mode !== "device_add" || s.step !== "description" || !s.data?.model) {
      /* Stale session — clear it so the admin isn't stuck. */
      if (s) await sessionClear(env.DB, adminId);
      return adminAnswer(
        env, chat,
        "⚠️ <b>اطلاعات دستگاه منقضی شده است</b>\n" +
        "<b>لطفا دوباره تلاش کنید</b>",
        utilAdminMenu(), opts
      );
    }

    const fromPage = Number(s.data.from_page) || 1;
    const editId = s.data.__prompt_msg_id || null;
    const opts2 = editId ? { editMessageId: editId } : {};

    let r;
    try {
      r = await run(
        env.DB,
        `INSERT INTO devices(model,description) VALUES(?,?)`,
        s.data.model,
        ""
      );
    } catch (e) {
      if (/UNIQUE constraint/i.test(String(e?.message || ""))) {
        const existing = await one(
          env.DB,
          "SELECT id, is_deleted FROM devices WHERE model=?",
          s.data.model
        );

        await sessionClear(env.DB, adminId);

        if (existing && existing.is_deleted) {
          await run(
            env.DB,
            `UPDATE devices
             SET is_deleted=0, description=?, is_available=0, updated_at=CURRENT_TIMESTAMP
             WHERE id=?`,
            "",
            existing.id
          );
          fireAndForget(
            ctx,
            audit(env, role, "create_device", `device:${existing.id}`, s.data.model)
          );
          return showDevices(env, chat, fromPage, {
            ...opts2,
            notice: "✅ <b>دستگاه احیا شد</b>",
          });
        }

        return adminAnswer(
          env, chat,
          "⚠️ <b>این مدل قبلاً ثبت شده است</b>\n" +
          "<b>لطفاً دوباره تلاش کنید</b>",
          kb([adminNavRow("a:devices")]), opts2
        );
      }
      throw e;
    }

    fireAndForget(
      ctx,
      audit(
        env, role, "create_device",
        `device:${r.meta?.last_row_id || ""}`, s.data.model
      )
    );

    await sessionClear(env.DB, adminId);
    return showDevices(env, chat, fromPage, {
      ...opts2,
      notice: "✅ <b>ذخیره شد</b>",
    });
  }

  if (data.startsWith("a:dev:")) {
    const parts = data.slice("a:dev:".length).split(":");
    const id = parts[0];
    const fromPage = parts[1] ? Number(parts[1]) : 1;
    if (!/^\d+$/.test(id))
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", utilAdminMenu(), opts
      );
    return showDevice(env, chat, id, fromPage, opts);
  }

  if (data.startsWith("a:toggle:")) {
    const parts = data.slice("a:toggle:".length).split(":");
    const id = parts[0];
    const fromPage = parts[1] ? Number(parts[1]) : 1;
    if (!/^\d+$/.test(id))
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", utilAdminMenu(), opts
      );
    const d = await one(
      env.DB,
      "SELECT model,is_available FROM devices WHERE id=? AND is_deleted=0",
      id
    );
    if (!d)
      return adminAnswer(env, chat, "❓ <b>دستگاه پیدا نشد</b>", utilAdminMenu(), opts);
    await run(
      env.DB,
      "UPDATE devices SET is_available=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      d.is_available ? 0 : 1,
      id
    );
    fireAndForget(
      ctx,
      audit(
        env, role, "toggle_device_availability", `device:${id}`,
        `${d.is_available} -> ${d.is_available ? 0 : 1}`
      )
    );
    return showDevice(env, chat, id, fromPage, opts);
  }

  if (data.startsWith("a:desc:")) {
    const parts = data.slice("a:desc:".length).split(":");
    const id = parts[0];
    const fromPage = parts[1] ? Number(parts[1]) : 1;
    if (!/^\d+$/.test(id))
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", utilAdminMenu(), opts
      );
    return askText(
      env, chat, adminId,
      "device_edit", "description", { device_id: id, from_page: fromPage },
      "✍️ <b>توضیحات جدید دستگاه را وارد کنید:</b>",
      fromPage > 1 ? `a:dev:${id}:${fromPage}` : `a:dev:${id}`, opts
    );
  }

  if (data.startsWith("a:image:")) {
    const parts = data.slice("a:image:".length).split(":");
    const id = parts[0];
    const fromPage = parts[1] ? Number(parts[1]) : 1;
    if (!/^\d+$/.test(id))
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", utilAdminMenu(), opts
      );
    return askText(
      env, chat, adminId,
      "device_image", "image", { device_id: id, from_page: fromPage },
      "🖼️ <b>تصویر دستگاه را ارسال کنید:</b>",
      fromPage > 1 ? `a:dev:${id}:${fromPage}` : `a:dev:${id}`, opts
    );
  }

  if (data.startsWith("a:guide:")) {
    const parts = data.slice("a:guide:".length).split(":");
    const id = parts[0];
    const fromPage = parts[1] ? Number(parts[1]) : 1;
    if (!/^\d+$/.test(id))
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", utilAdminMenu(), opts
      );
    return showGuideMenu(env, chat, id, fromPage, opts);
  }

  if (data.startsWith("a:guideproblem:")) {
    const parts = data.split(":");
    const id = parts[2];
    const pt = parts[3];
    const fromPage = parts[4] ? Number(parts[4]) : 1;
    if (!/^\d+$/.test(id) || !PROBLEM_TYPES.includes(pt)) {
      return adminAnswer(
        env, chat, "⚠️ <b>راهنما نامعتبر است</b>", utilAdminMenu(), opts
      );
    }
    return askText(
      env, chat, adminId,
      "device_guide", "description",
      { device_id: id, problem_type: pt, from_page: fromPage },
      "✍️ <b>متن راهنما را وارد کنید:</b>",
      fromPage > 1 ? `a:guide:${id}:${fromPage}` : `a:guide:${id}`, opts
    );
  }

  if (data.startsWith("a:delete:")) {
    const parts = data.slice("a:delete:".length).split(":");
    const id = parts[0];
    const fromPage = parts[1] ? Number(parts[1]) : 1;
    if (!/^\d+$/.test(id))
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", utilAdminMenu(), opts
      );

    const d = await one(
      env.DB,
      "SELECT model, is_available FROM devices WHERE id=? AND is_deleted=0",
      id
    );
    if (!d)
      return adminAnswer(env, chat, "❓ <b>دستگاه پیدا نشد</b>", utilAdminMenu(), opts);

    const statusLabel = d.is_available ? "🟢 موجود" : "🔴 ناموجود";

    return adminAnswer(
      env,
      chat,
      `⚠️ <b>هشدار: حذف دستگاه</b>\n\n` +
      `💳 <b>مدل:</b> ${esc(d.model)}\n` +
      `📌 <b>وضعیت:</b> ${statusLabel}\n\n` +
      `<b>با این کار:</b>\n` +
      `• دستگاه از لیست کاربران حذف می‌شود\n` +
      `• کاربران دیگر نمی‌توانند درخواست بدهند\n` +
      `• این عمل قابل بازگشت نیست\n\n` +
      `آیا مطمئنید؟`,
      kb([
        [btn("🗑️ بله، حذف کن", `a:deleteconfirm:${id}:${fromPage}`)],
        [btn("❌ انصراف", fromPage > 1 ? `a:dev:${id}:${fromPage}` : `a:dev:${id}`)],
      ]),
      opts
    );
  }

  if (data.startsWith("a:deleteconfirm:")) {
    const parts = data.slice("a:deleteconfirm:".length).split(":");
    const id = parts[0];
    if (!/^\d+$/.test(id))
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه دستگاه نامعتبر است</b>", utilAdminMenu(), opts
      );
    await run(
      env.DB,
      "UPDATE devices SET is_deleted=1,is_available=0,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      id
    );
    fireAndForget(ctx, audit(env, role, "delete_device", `device:${id}`));
    return showDevices(env, chat, 1, {
      ...opts,
      notice: "✅ <b>حذف شد</b>",
    });
  }

  if (data.startsWith("a:posreq:")) {
    const parts = data.split(":");
    const id = parts[2];
    const page = parts[3] ? Number(parts[3]) : 1;
    const filterType = parts[4] || "all";
    const filterValue = parts[5] || null;
    if (!/^\d+$/.test(id))
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه درخواست نامعتبر است</b>", utilAdminMenu(), opts
      );
    return showPosDetail(env, chat, id, page, filterType, filterValue, opts);
  }

  if (data.startsWith("a:repairreq:")) {
    const parts = data.split(":");
    const id = parts[2];
    const page = parts[3] ? Number(parts[3]) : 1;
    const filterType = parts[4] || "all";
    const filterValue = parts[5] || null;
    if (!/^\d+$/.test(id))
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه درخواست نامعتبر است</b>", utilAdminMenu(), opts
      );
    return showRepairDetail(env, chat, id, page, filterType, filterValue, opts);
  }

  if (data.startsWith("a:posstatus:")) {
    const parts = data.split(":");
    const id = parts[2];
    const st = parts[3];
    const page = parts[4] ? Number(parts[4]) : 1;
    const filterType = parts[5] || "all";
    const filterValue = parts[6] || null;
    return updateRequestStatus(
      env, chat, "pos", id, st, role,
      page, filterType, filterValue, opts, ctx
    );
  }

  if (data.startsWith("a:repstatus:")) {
    const parts = data.split(":");
    const id = parts[2];
    const st = parts[3];
    const page = parts[4] ? Number(parts[4]) : 1;
    const filterType = parts[5] || "all";
    const filterValue = parts[6] || null;
    return updateRequestStatus(
      env, chat, "repair", id, st, role,
      page, filterType, filterValue, opts, ctx
    );
  }

  /* ---- Send note to user ---- */
  if (data.startsWith("a:posnote:") || data.startsWith("a:repnote:")) {
    const isPos = data.startsWith("a:posnote:");
    const prefix = isPos ? "a:posnote:" : "a:repnote:";
    const parts = data.slice(prefix.length).split(":");
    const id = parts[0];
    const page = parts[1] ? Number(parts[1]) : 1;
    const filterType = parts[2] || "all";
    const filterValue = parts[3] || null;

    if (!/^\d+$/.test(id)) {
      return adminAnswer(
        env, chat, "⚠️ <b>شناسه درخواست نامعتبر است</b>", utilAdminMenu(), opts
      );
    }

    const table = isPos ? "pos_requests" : "repair_requests";
    const row = await one(
      env.DB,
      `SELECT id, telegram_user_id FROM ${table} WHERE id=?`,
      id
    );
    if (!row)
      return adminAnswer(env, chat, "❓ <b>درخواست پیدا نشد</b>", utilAdminMenu(), opts);

    const promptResult = await adminAnswer(
      env,
      chat,
      `📩 <b>متن یادداشت برای کاربر درخواست</b> <code>#${faDigits(id)}</code> <b>را بنویسید</b>\n` +
        `<b>برای انصراف، «لغو» را ارسال کنید</b>`,
      kb([adminNavRow("a:back")]),
      opts
    );

    const fSuffix = filterSuffix(filterType, filterValue);
    const __back_to = isPos
      ? `a:posreq:${id}:${page}${fSuffix}`
      : `a:repairreq:${id}:${page}${fSuffix}`;

    await sessionSet(env.DB, adminId, "send_note", "text", {
      target_user: String(row.telegram_user_id),
      request_id: id,
      request_type: isPos ? "pos" : "repair",
      from_page: page,
      filter_type: filterType,
      filter_value: filterValue,
      prompt_msg_id: promptResult?.message_id || opts?.editMessageId || null,
      __back_to,
    });

    return promptResult;
  }

  /* ---- Setting images ---- */
  if (
    data === "a:set:welcome_image" ||
    data === "a:set:about_image" ||
    data === "a:set:admin_welcome_image"
  ) {
    const target =
      data === "a:set:admin_welcome_image"
        ? "admin_welcome"
        : data === "a:set:about_image"
          ? "about"
          : "welcome";
    const backTo =
      target === "admin_welcome"
        ? "a:admin_welcome:menu"
        : target === "about"
          ? "a:about:menu"
          : "a:welcome:menu";
    return askText(
      env, chat, adminId,
      "settings_image", "image", { target },
      "🖼️ <b>تصویر را ارسال کنید:</b>",
      backTo, opts
    );
  }

  /* ---- Setting texts ---- */
  if (data.startsWith("a:set:")) {
    const field = data.slice("a:set:".length);

    const allowed = {
      welcome: "welcome_message",
      about: "about_contact_description",
      new_warranty: "new_warranty",
      used_warranty: "used_warranty",
      note_iranian: "note_iranian",
      note_foreign: "note_foreign",
    };

    if (!allowed[field]) {
      return adminAnswer(env, chat, "⚠️ <b>گزینه نامعتبر است</b>", utilAdminMenu(), opts);
    }

    const warrantyFields = ["new_warranty", "used_warranty"];
    const individualFields = ["note_iranian", "note_foreign"];

    const limit =
      field === "welcome"
        ? MAX.welcome
        : field === "about"
          ? MAX.about
          : individualFields.includes(field)
            ? MAX.applicant
            : MAX.warranty;

    const backTo = warrantyFields.includes(field)
      ? "a:warranty:menu"
      : individualFields.includes(field)
        ? "a:applicant_individual"
        : field === "welcome"
          ? "a:welcome:menu"
          : field === "about"
            ? "a:about:menu"
            : "a:personal";

    const prompts = {
      welcome: "✍️ <b>متن جدید را وارد کنید:</b>",
      about: "✍️ <b>متن جدید را وارد کنید:</b>",
      new_warranty: "✍️ <b>توضیحات جدید را وارد کنید:</b>",
      used_warranty: "✍️ <b>توضیحات جدید را وارد کنید:</b>",
      note_iranian: "✍️ <b>متن توضیحات برای «ایرانی» را وارد کنید:</b>",
      note_foreign: "✍️ <b>متن توضیحات برای «اتباع خارجی» را وارد کنید:</b>",
    };

    return askText(
      env, chat, adminId,
      "settings", field,
      { field: allowed[field], max: limit },
      prompts[field] || "✍️ <b>توضیحات جدید را وارد کنید:</b>",
      backTo, opts
    );
  }

  if (data === "a:applicant_legal") {
    return askText(
      env, chat, adminId,
      "settings", "intro_legal",
      { field: "intro_legal", max: MAX.applicant },
      "✍️ <b>متن توضیحات برای «پذیرنده حقوقی» را وارد کنید:</b>",
      "a:applicant:menu", opts
    );
  }

  /* ---- Add admin ---- */
  if (data === "a:admin:add") {
    if (!isSuperAdmin(env, adminId)) {
      return adminAnswer(env, chat, "⛔ <b>فقط Super Admin مجاز است</b>", utilAdminMenu(), opts);
    }

    const row = await one(env.DB, "SELECT COUNT(*) AS n FROM admins");
    const count = Number(row?.n || 0);

    if (count >= MAX_ADMINS) {
      return adminAnswer(
        env, chat,
        `⚠️ <b>حداکثر تعداد ادمین‌ها ${faDigits(MAX_ADMINS + 1)} نفر (شامل Super Admin) است</b>\n` +
        `ابتدا یک ادمین را حذف کنید`,
        kb([adminNavRow("a:admins")]),
        opts
      );
    }

    return askText(
      env, chat, adminId,
      "admin_add", "telegram_id", {},
      "🆔 <b>لطفا شناسه ادمین جدید را وارد کنید</b>",
      "a:admins", opts
    );
  }

  if (data.startsWith("a:admin:view:")) {
    if (!isSuperAdmin(env, adminId)) {
      return adminAnswer(env, chat, "⛔ <b>فقط Super Admin مجاز است</b>", utilAdminMenu(), opts);
    }
    const id = data.slice("a:admin:view:".length);
    if (!/^\d+$/.test(id))
      return adminAnswer(env, chat, "⚠️ <b>شناسه نامعتبر است</b>", utilAdminMenu(), opts);
    return showAdminDetail(env, chat, id, role, opts);
  }

  if (data.startsWith("a:admin:toggle:")) {
    if (!isSuperAdmin(env, adminId)) {
      return adminAnswer(env, chat, "⛔ <b>فقط Super Admin مجاز است</b>", utilAdminMenu(), opts);
    }
    const id = data.slice("a:admin:toggle:".length);
    if (!/^\d+$/.test(id))
      return adminAnswer(env, chat, "⚠️ <b>شناسه نامعتبر است</b>", utilAdminMenu(), opts);

    const row = await one(
      env.DB,
      "SELECT id,name,is_active,telegram_id FROM admins WHERE id=?",
      id
    );
    if (!row)
      return adminAnswer(env, chat, "❓ <b>ادمین پیدا نشد</b>", utilAdminMenu(), opts);

    if (String(row.telegram_id) === String(env.SUPER_ADMIN_ID || "")) {
      return adminAnswer(
        env, chat,
        "⛔ <b>امکان تغییر وضعیت Super Admin وجود ندارد</b>",
        utilAdminMenu(), opts
      );
    }

    await run(
      env.DB,
      "UPDATE admins SET is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      row.is_active ? 0 : 1,
      id
    );
    fireAndForget(
      ctx,
      audit(
        env, role, "toggle_admin", `admin:${id}`,
        `${row.is_active} -> ${row.is_active ? 0 : 1}`
      )
    );
    return showAdminDetail(env, chat, id, role, opts);
  }

  if (data.startsWith("a:admin:delete:")) {
    if (!isSuperAdmin(env, adminId)) {
      return adminAnswer(env, chat, "⛔ <b>فقط Super Admin مجاز است</b>", utilAdminMenu(), opts);
    }
    const id = data.slice("a:admin:delete:".length);
    if (!/^\d+$/.test(id))
      return adminAnswer(env, chat, "⚠️ <b>شناسه نامعتبر است</b>", utilAdminMenu(), opts);

    const row = await one(
      env.DB,
      "SELECT id,name,telegram_id FROM admins WHERE id=?",
      id
    );
    if (!row)
      return adminAnswer(env, chat, "❓ <b>ادمین پیدا نشد</b>", utilAdminMenu(), opts);

    if (String(row.telegram_id) === String(env.SUPER_ADMIN_ID || "")) {
      return adminAnswer(
        env, chat,
        "⛔ <b>امکان حذف Super Admin وجود ندارد</b>",
        utilAdminMenu(), opts
      );
    }

    return adminAnswer(
      env,
      chat,
      `⚠️ <b>هشدار: حذف ادمین</b>\n\n` +
      `👤 <b>نام:</b> ${esc(row.name)}\n` +
      `🆔 <b>شناسه:</b> <code>${esc(row.telegram_id)}</code>\n\n` +
      `<b>با این کار:</b>\n` +
      `• دسترسی این ادمین به بات قطع می‌شود\n` +
      `• لاگ‌های قبلی باقی می‌مانند\n` +
      `• این عمل قابل بازگشت نیست\n\n` +
      `آیا مطمئنید؟`,
      kb([
        [btn("🗑️ بله، حذف کن", `a:admin:deleteconfirm:${row.id}`)],
        [btn("❌ انصراف", `a:admin:view:${row.id}`)],
      ]),
      opts
    );
  }

  if (data.startsWith("a:admin:deleteconfirm:")) {
    if (!isSuperAdmin(env, adminId)) {
      return adminAnswer(env, chat, "⛔ <b>فقط Super Admin مجاز است</b>", utilAdminMenu(), opts);
    }
    const id = data.slice("a:admin:deleteconfirm:".length);
    if (!/^\d+$/.test(id))
      return adminAnswer(env, chat, "⚠️ <b>شناسه نامعتبر است</b>", utilAdminMenu(), opts);

    const row = await one(
      env.DB,
      "SELECT id,name,telegram_id FROM admins WHERE id=?",
      id
    );
    if (!row)
      return adminAnswer(env, chat, "❓ <b>ادمین پیدا نشد</b>", utilAdminMenu(), opts);

    if (String(row.telegram_id) === String(env.SUPER_ADMIN_ID || "")) {
      return adminAnswer(
        env, chat,
        "⛔ <b>امکان حذف Super Admin وجود ندارد</b>",
        utilAdminMenu(), opts
      );
    }

    await run(env.DB, "DELETE FROM admins WHERE id=?", id);
    fireAndForget(
      ctx,
      audit(env, role, "delete_admin", `telegram:${row.telegram_id}`, row.name)
    );
    return showAdmins(env, chat, role, {
      ...opts,
      notice: "✅ <b>حذف شد</b>",
    });
  }

  return adminAnswer(
    env, chat, "⚠️ <b>عملیات تعریف نشده است</b>", utilAdminMenu(), opts
  );
}

/* ============================================================
 * Photo handler
 * ============================================================ */

async function handleAdminPhoto(env, chat, userId, msg, session, role, ctx) {
  if (!msg?.photo?.length) {
    return adminAnswer(
      env,
      chat,
      "🖼️ <b>لطفا یک فایل تصویری ارسال کنید</b>\n<b>فایل متنی قابل استفاده نیست</b>",
      kb([adminNavRow("a:back")])
    );
  }

  const fileId = msg.photo.at(-1)?.file_id;
  if (!fileId) return adminAnswer(env, chat, "⚠️ <b>شناسه تصویر پیدا نشد</b>");

  const data = session.data || {};

  if (session.mode === "device_image" && !data.device_id) {
    await sessionClear(env.DB, userId);
    return adminAnswer(
      env, chat,
      "⚠️ <b>اطلاعات دستگاه یافت نشد</b>\n" +
      "<b>لطفا دوباره تلاش کنید</b>",
      utilAdminMenu()
    );
  }

  if (
    session.mode === "settings_image" &&
    !["welcome", "about", "admin_welcome"].includes(data.target)
  ) {
    await sessionClear(env.DB, userId);
    return adminAnswer(
      env, chat,
      "⚠️ <b>هدف آپلود نامعتبر است</b>",
      utilAdminMenu()
    );
  }

  let repo;
  try {
    repo = await clonePhotoToRepo(env, fileId);
  } catch (e) {
    console.error("clonePhotoToRepo failed:", safeError(e));
    return adminAnswer(
      env, chat,
      "⚠️ <b>ذخیره تصویر در سرور با خطا مواجه شد</b>",
      kb([adminNavRow("a:back")])
    );
  }

  const editId = data.__prompt_msg_id || null;
  const editOpts = editId ? { editMessageId: editId } : {};

  if (session.mode === "device_image") {
    const fromPage = Number(data.from_page) || 1;
    const r = await run(
      env.DB,
      `UPDATE devices
       SET device_image_file_id=?,device_image_message_id=?,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND is_deleted=0`,
      repo.fileId,
      String(repo.messageId),
      data.device_id
    );

    await deleteUserMsg(env, chat, msg?.message_id);
    await sessionClear(env.DB, userId);

    if (r?.meta?.changes === 0) {
      return adminAnswer(
        env, chat,
        "❓ <b>دستگاه پیدا نشد</b>\n" +
        "احتمالاً حذف شده است",
        kb([adminNavRow("a:devices")]),
        editOpts
      );
    }

    fireAndForget(ctx, audit(env, role, "set_device_image", `device:${data.device_id}`));
    return showDevice(env, chat, data.device_id, fromPage, {
      ...editOpts,
      notice: "✅ <b>آپلود شد</b>",
    });
  }

  if (session.mode === "settings_image") {
    if (data.target === "welcome") {
      await run(
        env.DB,
        `UPDATE settings SET welcome_image_file_id=?,welcome_image_message_id=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1`,
        repo.fileId,
        String(repo.messageId),
        String(role.telegram_id)
      );
      await deleteUserMsg(env, chat, msg?.message_id);
      await sessionClear(env.DB, userId);
      fireAndForget(ctx, audit(env, role, "set_setting_image", "settings:welcome"));
      return showWelcomeMenu(env, chat, {
        ...editOpts,
        notice: "✅ <b>آپلود شد</b>",
      });
    }

    if (data.target === "about") {
      await run(
        env.DB,
        `UPDATE settings SET about_contact_image_file_id=?,about_contact_image_message_id=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1`,
        repo.fileId,
        String(repo.messageId),
        String(role.telegram_id)
      );
      await deleteUserMsg(env, chat, msg?.message_id);
      await sessionClear(env.DB, userId);
      fireAndForget(ctx, audit(env, role, "set_setting_image", "settings:about"));
      return showAboutMenu(env, chat, {
        ...editOpts,
        notice: "✅ <b>آپلود شد</b>",
      });
    }

    if (data.target === "admin_welcome") {
      await run(
        env.DB,
        `UPDATE settings SET admin_welcome_image_file_id=?,admin_welcome_image_message_id=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1`,
        repo.fileId,
        String(repo.messageId),
        String(role.telegram_id)
      );
      await deleteUserMsg(env, chat, msg?.message_id);
      await sessionClear(env.DB, userId);
      fireAndForget(ctx, audit(env, role, "set_setting_image", "settings:admin_welcome"));
      return showAdminWelcomeMenu(env, chat, {
        ...editOpts,
        notice: "✅ <b>آپلود شد</b>",
      });
    }
  }

  await sessionClear(env.DB, userId);
  return adminAnswer(
    env, chat, "⚠️ <b>این عملیات پشتیبانی نمی‌شود</b>", utilAdminMenu()
  );
}

/* ============================================================
 * Text input handler
 * ============================================================ */

export async function adminMessage(
  env, chat, user, msg, role, updateId = null, ctx = null
) {
  const userId = String(user.id);

  if (msg?.text?.startsWith("/start")) {
    await sessionClear(env.DB, userId);
    return adminStart(env, chat, role);
  }

  if (isCancelText(msg?.text)) {
    await sessionClear(env.DB, userId);
    return adminStart(env, chat, role);
  }

  const s = await sessionGet(env.DB, userId);
  if (!s) {
    return adminAnswer(
      env, chat, "⚠️ <b>لطفا از گزینه‌های پنل مدیریت استفاده کنید</b>",
      utilAdminMenu()
    );
  }

  if (["device_image", "settings_image"].includes(s.mode)) {
    return handleAdminPhoto(env, chat, userId, msg, s, role, ctx);
  }

  if (s.mode === "admin_search" && s.step === "query") {
    const query = trimText(msg?.text, 100);

    if (query.length < 2) {
      const editId = s.data?.__prompt_msg_id || null;
      return adminAnswer(
        env, chat,
        "⚠️ <b>عبارت جستجو باید حداقل ۲ کاراکتر باشد</b>",
        kb([adminNavRow("a:back")]),
        editId ? { editMessageId: editId } : {}
      );
    }

    const kind = s.data?.kind === "repair" ? "repair" : "pos";
    const editId = s.data?.__prompt_msg_id || null;
    const opts2 = editId ? { editMessageId: editId } : {};

    await deleteUserMsg(env, chat, msg?.message_id);

    await sessionSet(env.DB, userId, "admin_search", "results", {
      kind,
      query,
      __back_to: kind === "pos" ? "a:pos" : "a:repair",
    });

    return kind === "pos"
      ? showPosRequests(env, chat, 1, { query }, opts2)
      : showRepairRequests(env, chat, 1, { query }, opts2);
  }

  if (s.mode === "admin_search" && s.step === "results") {
    const kind = s.data?.kind === "repair" ? "repair" : "pos";
    const searchCb = kind === "repair" ? "a:repair:search" : "a:pos:search";
    const editId = s.data?.__prompt_msg_id || null;

    await deleteUserMsg(env, chat, msg?.message_id);

    return adminAnswer(
      env, chat,
      "⚠️ <b>برای جستجوی جدید، روی «🔍 جستجوی جدید» بزنید</b>",
      kb([
        [btn("🔍 جستجوی جدید", searchCb)],
        adminNavRow(kind === "repair" ? "a:repair" : "a:pos"),
      ]),
      editId ? { editMessageId: editId } : {}
    );
  }

  if (s.mode === "send_note" && s.step === "text") {
    const text = String(msg?.text || "").trim();
    if (!text) {
      return adminAnswer(
        env, chat, "⚠️ <b>متن یادداشت نمی‌تواند خالی باشد</b>",
        kb([adminNavRow("a:back")])
      );
    }
    if (text.length > 2000) {
      return adminAnswer(
        env, chat,
        "⚠️ <b>متن یادداشت بیش از حد طولانی است (حداکثر ۲۰۰۰ کاراکتر)</b>",
        kb([adminNavRow("a:back")])
      );
    }

    const {
      target_user,
      request_id,
      request_type,
      from_page,
      filter_type,
      filter_value,
      prompt_msg_id,
    } = s.data;
    const SEP = "━".repeat(20);

    const senderName = esc(role.name || "پشتیبانی");

    const noteBody =
      `🔔 <b>یادداشت جدید از پشتیبانی</b>\n\n` +
      `${SEP}\n` +
      `🆔 <b>شماره درخواست:</b> #${faDigits(request_id)}\n` +
      `👤 <b>فرستنده:</b> ${senderName}\n` +
      `${SEP}\n\n` +
      `📝 <b>متن یادداشت دریافتی:</b>\n${esc(text)}\n\n` +
      `${SEP}`;

    let sentOk = true;
    try {
      await tg(env, "sendMessage", {
        chat_id: target_user,
        text: noteBody,
        parse_mode: "HTML",
        reply_markup: kb([[btn("❌ بستن", "u:close")]]),
      });
    } catch (e) {
      console.error("send note to user failed:", safeError(e));
      sentOk = false;
    }

    fireAndForget(
      ctx, audit(env, role, `send_note_${request_type}`, `#${request_id}`)
    );

    await deleteUserMsg(env, chat, msg?.message_id);
    await sessionClear(env.DB, userId);

    const header = sentOk
      ? `✅ <b>یادداشت با موفقیت ارسال شد</b>`
      : `⚠️ <b>ارسال یادداشت ناموفق بود</b>`;

    const receipt =
      `${header}\n\n` +
      `${SEP}\n` +
      `🆔 <b>شماره درخواست:</b> #${faDigits(request_id)}\n` +
      `👤 <b>گیرنده:</b> ${esc(target_user)}\n` +
      `${SEP}\n\n` +
      `📝 <b>متن یادداشت ارسالی:</b>\n${esc(text)}\n\n` +
      `${SEP}`;

    await toast(env, chat, receipt, kb([[btn("❌ بستن", "u:close")]]));

    const fSuffix = filterSuffix(filter_type || "all", filter_value || null);
    const target =
      request_type === "pos"
        ? `a:posreq:${request_id}:${from_page || 1}${fSuffix}`
        : `a:repairreq:${request_id}:${from_page || 1}${fSuffix}`;

    return adminCallback(env, chat, target, role, prompt_msg_id || null, ctx, false);
  }

  if (s.mode === "device_add") {
    const editId = s.data.__prompt_msg_id || null;
    const opts2 = editId ? { editMessageId: editId } : {};

    if (s.step === "model") {
      const model = trimText(msg?.text, MAX.model);
      if (model.length < 1)
        return adminAnswer(
          env, chat, "⚠️ <b>مدل دستگاه را وارد کنید:</b>",
          kb([adminNavRow("a:back")]), opts2
        );

      const existing = await one(
        env.DB,
        "SELECT id, is_deleted FROM devices WHERE model=?",
        model
      );

      if (existing && !existing.is_deleted) {
        return adminAnswer(
          env, chat,
          "⚠️ <b>این مدل قبلاً ثبت شده است</b>\n" +
          "<b>مدل دیگری وارد کنید:</b>",
          kb([adminNavRow("a:back")]), opts2
        );
      }

      await deleteUserMsg(env, chat, msg?.message_id);
      const prompt = await adminAnswer(
        env, chat,
        "✍️ <b>توضیحات دستگاه را وارد کنید</b>\n<b>درغیر اینصورت «⏭️ رد کردن» را بزنید</b>",
        kb([
          [btn("⏭️ رد کردن", "a:add:skip")],
          adminNavRow("a:back"),
        ]), opts2
      );
      await sessionSet(env.DB, userId, "device_add", "description", {
        model,
        from_page: s.data.from_page || 1,
        __back_to: s.data.__back_to || "a:devices",
        __prompt_msg_id: prompt?.message_id || editId || null,
      });
      return prompt;
    }

    if (s.step === "description") {
      const raw = String(msg?.text || "").trim();
      const description = ["ندارد", "ندارم", "-"].includes(raw)
        ? ""
        : trimText(raw, MAX.description);
      const fromPage = Number(s.data.from_page) || 1;

      let r;
      try {
        r = await run(
          env.DB,
          `INSERT INTO devices(model,description) VALUES(?,?)`,
          s.data.model,
          description
        );
      } catch (e) {
        if (/UNIQUE constraint/i.test(String(e?.message || ""))) {
          const existing = await one(
            env.DB,
            "SELECT id, is_deleted FROM devices WHERE model=?",
            s.data.model
          );

          await sessionClear(env.DB, userId);
          await deleteUserMsg(env, chat, msg?.message_id);

          if (existing && existing.is_deleted) {
            await run(
              env.DB,
              `UPDATE devices
               SET is_deleted=0, description=?, is_available=0, updated_at=CURRENT_TIMESTAMP
               WHERE id=?`,
              description,
              existing.id
            );
            fireAndForget(
              ctx,
              audit(env, role, "create_device", `device:${existing.id}`, s.data.model)
            );
            return showDevices(env, chat, fromPage, {
              ...opts2,
              notice: "✅ <b>دستگاه احیا شد</b>",
            });
          }

          return adminAnswer(
            env, chat,
            "⚠️ <b>این مدل قبلاً ثبت شده است</b>\n" +
            "<b>لطفاً دوباره تلاش کنید</b>",
            kb([adminNavRow("a:devices")]), opts2
          );
        }
        throw e;
      }

      fireAndForget(
        ctx,
        audit(
          env, role, "create_device",
          `device:${r.meta?.last_row_id || ""}`, s.data.model
        )
      );
      await deleteUserMsg(env, chat, msg?.message_id);
      await sessionClear(env.DB, userId);
      return showDevices(env, chat, fromPage, {
        ...opts2,
        notice: "✅ <b>ذخیره شد</b>",
      });
    }
  }

  if (s.mode === "device_edit" && s.step === "description") {
    const editId = s.data.__prompt_msg_id || null;
    const fromPage = Number(s.data.from_page) || 1;
    const description = trimText(msg?.text, MAX.description);

    const r = await run(
      env.DB,
      "UPDATE devices SET description=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND is_deleted=0",
      description,
      s.data.device_id
    );

    await deleteUserMsg(env, chat, msg?.message_id);
    await sessionClear(env.DB, userId);

    if (r?.meta?.changes === 0) {
      return adminAnswer(
        env, chat,
        "❓ <b>دستگاه پیدا نشد</b>\n" +
        "احتمالاً حذف شده است",
        kb([adminNavRow("a:devices")]),
        editId ? { editMessageId: editId } : {}
      );
    }

    fireAndForget(
      ctx,
      audit(env, role, "edit_device_description", `device:${s.data.device_id}`)
    );
    return showDevice(env, chat, s.data.device_id, fromPage, {
      ...(editId ? { editMessageId: editId } : {}),
      notice: "✅ <b>ذخیره شد</b>",
    });
  }

  if (s.mode === "device_guide" && s.step === "description") {
    const editId = s.data.__prompt_msg_id || null;
    const fromPage = Number(s.data.from_page) || 1;
    const description = trimText(msg?.text, MAX.description);
    if (!description)
      return adminAnswer(
        env, chat, "⚠️ <b>راهنما نمی‌تواند خالی باشد</b>",
        kb([adminNavRow("a:back")]),
        editId ? { editMessageId: editId } : {}
      );

    await run(
      env.DB,
      `INSERT INTO troubleshooting_guides(device_id,problem_type,description,updated_by,updated_at)
       VALUES(?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(device_id,problem_type) DO UPDATE SET
         description=excluded.description,
         updated_by=excluded.updated_by,
         updated_at=CURRENT_TIMESTAMP`,
      s.data.device_id,
      s.data.problem_type,
      description,
      String(role.telegram_id)
    );
    fireAndForget(
      ctx,
      audit(
        env, role, "set_troubleshooting_guide",
        `device:${s.data.device_id}`, s.data.problem_type
      )
    );
    await deleteUserMsg(env, chat, msg?.message_id);
    await sessionClear(env.DB, userId);
    return showGuideMenu(env, chat, s.data.device_id, fromPage, {
      ...(editId ? { editMessageId: editId } : {}),
      notice: "✅ <b>ذخیره شد</b>",
    });
  }

  if (s.mode === "settings") {
    const editId = s.data.__prompt_msg_id || null;
    const opts2 = editId ? { editMessageId: editId } : {};

    const field = s.data.field;

    if (!ALLOWED_SETTINGS_FIELDS.has(field)) {
      await sessionClear(env.DB, userId);
      return adminAnswer(
        env, chat,
        "⚠️ <b>فیلد نامعتبر است</b>",
        utilAdminMenu()
      );
    }

    const max = Number(s.data.max || MAX.description);
    const raw = String(msg?.text || "").trim();

    const optionalFields = ["note_iranian", "note_foreign"];
    const value = trimText(raw, max);

    if (!value && !optionalFields.includes(field)) {
      return adminAnswer(
        env, chat, "⚠️ <b>فیلد نمی‌تواند خالی باشد</b>",
        kb([adminNavRow("a:back")]), opts2
      );
    }

    await run(
      env.DB,
      `UPDATE settings SET ${field}=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=1`,
      value || "",
      String(role.telegram_id)
    );
    fireAndForget(ctx, audit(env, role, `set_${field}`, "settings:1"));
    await deleteUserMsg(env, chat, msg?.message_id);
    await sessionClear(env.DB, userId);

    const noticeOpts = { ...opts2, notice: "✅ <b>ذخیره شد</b>" };

    if (field === "welcome_message") return showWelcomeMenu(env, chat, noticeOpts);
    if (field === "about_contact_description") return showAboutMenu(env, chat, noticeOpts);
    if (field === "new_warranty" || field === "used_warranty")
      return showWarrantyMenu(env, chat, noticeOpts);
    if (field === "intro_legal") return showApplicantMenu(env, chat, noticeOpts);
    if (field === "note_iranian" || field === "note_foreign")
      return showIndividualMenu(env, chat, noticeOpts);

    return showSettings(env, chat, noticeOpts);
  }

  if (s.mode === "admin_add") {
    if (!isSuperAdmin(env, userId)) {
      await sessionClear(env.DB, userId);
      return adminAnswer(
        env, chat, "⛔ <b>فقط Super Admin مجاز است</b>", utilAdminMenu()
      );
    }

    if (s.step === "telegram_id") {
      const editId = s.data.__prompt_msg_id || null;
      const opts2 = editId ? { editMessageId: editId } : {};

      const tgId = String(msg?.text || "").trim();
      if (!/^\d{1,32}$/.test(tgId))
        return adminAnswer(
          env, chat, "🔢 <b>لطفا شناسه عددی را وارد کنید</b>",
          kb([adminNavRow("a:back")]), opts2
        );

      if (String(tgId) === String(env.SUPER_ADMIN_ID || "")) {
        return adminAnswer(
          env, chat,
          "⚠️ <b>این شناسه Super Admin است</b>\n" +
          "نمی‌توان آن را به‌عنوان ادمین عادی اضافه کرد",
          kb([adminNavRow("a:back")]), opts2
        );
      }

      const exists = await one(
        env.DB,
        "SELECT id FROM admins WHERE telegram_id=?",
        tgId
      );
      if (exists)
        return adminAnswer(
          env, chat, "⚠️ <b>این شناسه قبلا در لیست ادمین‌ها است</b>",
          kb([adminNavRow("a:back")]), opts2
        );

      await deleteUserMsg(env, chat, msg?.message_id);
      const prompt = await adminAnswer(
        env, chat, "✍️ <b>نام ادمین را وارد کنید:</b>",
        kb([adminNavRow("a:back")]), opts2
      );
      await sessionSet(env.DB, userId, "admin_add", "name", {
        telegram_id: tgId,
        __back_to: "a:admins",
        __prompt_msg_id: prompt?.message_id || editId || null,
      });
      return prompt;
    }

    if (s.step === "name") {
      const editId = s.data.__prompt_msg_id || null;
      const opts2 = editId ? { editMessageId: editId } : {};

      const name = trimText(msg?.text, MAX.name);
      if (name.length < 2)
        return adminAnswer(
          env, chat, "✍️ <b>نام معتبر وارد کنید</b>",
          kb([adminNavRow("a:back")]), opts2
        );

      const r = await run(
        env.DB,
        `INSERT INTO admins(telegram_id,name,role,is_active)
         SELECT ?, ?, 'admin', 1
         WHERE (SELECT COUNT(*) FROM admins) < ?`,
        s.data.telegram_id,
        name,
        MAX_ADMINS
      );

      if (r?.meta?.changes === 0) {
        await sessionClear(env.DB, userId);
        await deleteUserMsg(env, chat, msg?.message_id);
        return adminAnswer(
          env, chat,
          `⚠️ <b>حداکثر تعداد ادمین‌ها ${faDigits(MAX_ADMINS + 1)} نفر (شامل Super Admin) است</b>\n` +
          `ابتدا یک ادمین را حذف کنید`,
          kb([adminNavRow("a:admins")]), opts2
        );
      }

      fireAndForget(
        ctx,
        audit(env, role, "add_admin", `telegram:${s.data.telegram_id}`, name)
      );
      await deleteUserMsg(env, chat, msg?.message_id);
      await sessionClear(env.DB, userId);
      return showAdmins(env, chat, role, {
        ...opts2,
        notice: "✅ <b>افزوده شد</b>",
      });
    }
  }

  return adminAnswer(
    env,
    chat,
    "⚠️ <b>ورودی نامعتبر است</b>\n" +
    "<b>برای انصراف، «لغو» را ارسال کنید</b>",
    kb([adminNavRow("a:back")])
  );
}
